(function () {
  const viewer = document.getElementById('viewer');
  const DEFAULT_FONT_SIZE = 16;
  const TEXT_PAGE_CHUNK = 1600;

  let currentType = null;
  let book = null;
  let rendition = null;
  let spineItems = [];
  let textPages = [];
  let textContainer = null;
  let currentPage = 1;
  let pageCount = 0;
  let zoom = 1.0;

  const sendMessage = (payload) => {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      return;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  };

  const sendResponse = (id, ok, data, error) => {
    sendMessage({ type: 'response', id, ok, data, error });
  };

  const sendState = (extra) => {
    sendMessage({
      type: 'state',
      payload: {
        pageCount,
        currentPage,
        zoom,
        ...(extra || {}),
      },
    });
  };

  const sendEvent = (name, payload) => {
    sendMessage({ type: 'event', name, payload });
  };

  const clearViewer = () => {
    while (viewer.firstChild) {
      viewer.removeChild(viewer.firstChild);
    }
  };

  const decodeBase64 = (value) => {
    const clean = value.replace(/\s/g, '');
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const decodeBase64ToText = (value) => {
    const bytes = decodeBase64(value);
    return new TextDecoder('utf-8').decode(bytes);
  };

  const normalizeHref = (href) => {
    if (!href) return '';
    return href.split('#')[0];
  };

  const getSpineIndexByHref = (href) => {
    const normalized = normalizeHref(href);
    if (!normalized) return -1;
    return spineItems.findIndex((item) => normalizeHref(item.href) === normalized);
  };

  const buildOutline = async () => {
    if (!book || !book.loaded || !book.loaded.navigation) return [];
    const nav = await book.loaded.navigation;
    const toc = nav && nav.toc ? nav.toc : [];

    const mapItem = (item) => {
      const title = item.label || item.title || '';
      const pageIndex = getSpineIndexByHref(item.href || '');
      const children = Array.isArray(item.subitems) ? item.subitems.map(mapItem) : [];
      const outlineItem = { title, pageIndex };
      if (children.length > 0) outlineItem.children = children;
      return outlineItem;
    };

    return toc.map(mapItem);
  };

  const applyEpubZoom = () => {
    if (!rendition || !rendition.themes) return;
    const fontSize = `${Math.round(zoom * 100)}%`;
    if (typeof rendition.themes.fontSize === 'function') {
      rendition.themes.fontSize(fontSize);
    } else if (typeof rendition.themes.override === 'function') {
      rendition.themes.override('font-size', fontSize);
    }
  };

  const applyTextZoom = () => {
    if (!textContainer) return;
    const fontSize = Math.max(12, Math.round(DEFAULT_FONT_SIZE * zoom));
    textContainer.style.fontSize = `${fontSize}px`;
  };

  const renderTextPage = (pageIndex) => {
    const text = textPages[pageIndex] || '';
    if (!textContainer) {
      textContainer = document.createElement('div');
      textContainer.style.padding = '24px';
      textContainer.style.lineHeight = '1.6';
      textContainer.style.whiteSpace = 'pre-wrap';
      textContainer.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      viewer.appendChild(textContainer);
    }
    textContainer.textContent = text;
    applyTextZoom();
  };

  const paginateText = (text) => {
    const pages = [];
    for (let i = 0; i < text.length; i += TEXT_PAGE_CHUNK) {
      pages.push(text.slice(i, i + TEXT_PAGE_CHUNK));
    }
    return pages.length > 0 ? pages : [''];
  };

  const loadText = async (source) => {
    let text = '';
    if (source.kind === 'uri') {
      const res = await fetch(source.uri);
      text = await res.text();
    } else if (source.kind === 'base64') {
      text = decodeBase64ToText(source.data);
    } else if (source.kind === 'text') {
      text = source.text || '';
    }

    clearViewer();
    textPages = paginateText(text);
    pageCount = textPages.length;
    currentPage = 1;
    textContainer = null;
    renderTextPage(0);
    return { pageCount };
  };

  const loadEpub = async (source) => {
    if (rendition && typeof rendition.destroy === 'function') {
      rendition.destroy();
    }
    if (book && typeof book.destroy === 'function') {
      book.destroy();
    }

    let data = null;
    if (source.kind === 'uri') {
      data = source.uri;
    } else if (source.kind === 'base64') {
      data = decodeBase64(source.data);
    } else if (source.kind === 'text') {
      const encoder = new TextEncoder();
      data = encoder.encode(source.text || '').buffer;
    }

    book = ePub(data);
    await book.ready;

    spineItems = book.spine && book.spine.items ? book.spine.items : [];
    pageCount = spineItems.length;
    currentPage = 1;

    clearViewer();
    rendition = book.renderTo(viewer, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
    });

    if (rendition && rendition.hooks && rendition.hooks.content) {
      rendition.hooks.content.register((contents) => {
        const frame = contents && contents.document ? contents.document.defaultView.frameElement : null;
        if (frame) {
          frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        }
      });
    }

    if (rendition && typeof rendition.on === 'function') {
      rendition.on('selected', (cfiRange, contents) => {
        const selection = contents && contents.window ? contents.window.getSelection() : null;
        const text = selection ? selection.toString().trim() : '';
        if (text) {
          sendEvent('TEXT_SELECTED', { text, pageIndex: Math.max(0, currentPage - 1) });
        }
        if (rendition && rendition.annotations && typeof rendition.annotations.remove === 'function') {
          rendition.annotations.remove(cfiRange, 'highlight');
        }
      });
    }

    await displayEpubPage(0);
    applyEpubZoom();

    const outline = await buildOutline();
    return { pageCount, outline };
  };

  const displayEpubPage = async (pageIndex) => {
    if (!rendition) return;
    const item = spineItems[pageIndex];
    if (!item) return;
    const target = item.href || item.idref || item.cfiBase || pageIndex;
    await rendition.display(target);
    currentPage = pageIndex + 1;
    sendState();
  };

  const getTextContent = async (pageIndex) => {
    if (currentType === 'text') {
      const text = textPages[pageIndex] || '';
      return [{
        str: text,
        dir: 'ltr',
        width: 0,
        height: 0,
        transform: [1, 0, 0, 1, 0, 0],
        fontName: 'default',
      }];
    }

    if (currentType === 'epub') {
      if (!book) return [];
      const item = spineItems[pageIndex];
      if (!item) return [];
      try {
        const section = book.spine.get(item.idref || item.href);
        const text = section && typeof section.text === 'function' ? await section.text() : '';
        if (!text) return [];
        return [{
          str: text,
          dir: 'ltr',
          width: 0,
          height: 0,
          transform: [1, 0, 0, 1, 0, 0],
          fontName: 'default',
        }];
      } catch (err) {
        return [];
      }
    }

    return [];
  };

  const getPageText = async (pageIndex) => {
    const items = await getTextContent(pageIndex);
    return items.map((item) => item.str).join(' ');
  };

  const searchText = async (query) => {
    const normalized = query.toLowerCase();
    const results = [];

    for (let i = 0; i < pageCount; i += 1) {
      const text = await getPageText(i);
      if (!text) continue;
      const lower = text.toLowerCase();
      let pos = lower.indexOf(normalized, 0);
      let matchIndex = 0;
      while (pos !== -1) {
        const start = Math.max(0, pos - 20);
        const end = Math.min(text.length, pos + query.length + 20);
        results.push({ pageIndex: i, text: text.substring(start, end), matchIndex });
        matchIndex += 1;
        pos = lower.indexOf(normalized, pos + 1);
      }
    }

    return results;
  };

  const getPageDimensions = () => ({
    width: viewer.clientWidth || 0,
    height: viewer.clientHeight || 0,
  });

  const getPageIndex = (dest) => {
    if (currentType !== 'epub') return null;
    if (typeof dest === 'string') return getSpineIndexByHref(dest);
    return null;
  };

  const selectText = async (pageIndex) => {
    const text = await getPageText(pageIndex);
    if (!text) return null;
    return {
      text,
      rects: [{ x: 0, y: 0, width: 1, height: 1 }],
    };
  };

  const applyZoom = () => {
    if (currentType === 'text') {
      applyTextZoom();
    } else if (currentType === 'epub') {
      applyEpubZoom();
    }
  };

  const handleCommand = async (message) => {
    const { id, kind, payload } = message;

    try {
      if (kind === 'load') {
        currentType = payload.type;
        zoom = 1.0;

        if (currentType === 'text') {
          const result = await loadText(payload.source);
          sendState();
          sendResponse(id, true, result);
          return;
        }

        if (currentType === 'epub') {
          const result = await loadEpub(payload.source);
          sendState({ outline: result.outline || [] });
          sendResponse(id, true, result);
          return;
        }

        throw new Error('Unsupported document type');
      }

      if (kind === 'go-to-page') {
        const page = Math.max(1, payload.page || 1);
        if (currentType === 'text') {
          currentPage = page;
          renderTextPage(page - 1);
          sendState();
        } else if (currentType === 'epub') {
          await displayEpubPage(page - 1);
        }
        sendResponse(id, true, { currentPage });
        return;
      }

      if (kind === 'set-zoom') {
        zoom = Math.max(0.5, Math.min(4.0, payload.zoom || 1.0));
        applyZoom();
        sendState();
        sendResponse(id, true, { zoom });
        return;
      }

      if (kind === 'set-rotation') {
        sendResponse(id, true, {});
        return;
      }

      if (kind === 'get-text-content') {
        const items = await getTextContent(payload.pageIndex || 0);
        sendResponse(id, true, items);
        return;
      }

      if (kind === 'get-page-dimensions') {
        sendResponse(id, true, getPageDimensions());
        return;
      }

      if (kind === 'search-text') {
        const results = await searchText(payload.query || '');
        sendResponse(id, true, results);
        return;
      }

      if (kind === 'select-text') {
        const selection = await selectText(payload.pageIndex || 0);
        sendResponse(id, true, selection);
        return;
      }

      if (kind === 'get-outline') {
        const outline = await buildOutline();
        sendResponse(id, true, outline);
        return;
      }

      if (kind === 'get-page-index') {
        const index = getPageIndex(payload.dest);
        sendResponse(id, true, index);
        return;
      }

      if (kind === 'destroy') {
        clearViewer();
        sendResponse(id, true, {});
        return;
      }

      sendResponse(id, false, null, 'Unknown command');
    } catch (err) {
      sendResponse(id, false, null, err && err.message ? err.message : String(err));
    }
  };

  const onMessage = (event) => {
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (!message || !message.kind || !message.id) return;
    handleCommand(message);
  };

  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);

  sendMessage({ type: 'ready' });
})();
