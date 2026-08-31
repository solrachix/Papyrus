/* @papyrus-comic-runtime:start */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PapyrusComicRuntime = Object.assign(
      factory(),
      root.PapyrusComicRuntime || {}
    );
  }
})(typeof self === "object" ? self : this, function () {
  var IMAGE_EXTENSIONS = /\.(?:gif|jpe?g|png|svg|webp)$/i;

  function isComicImageName(name) {
    return typeof name === "string" && IMAGE_EXTENSIONS.test(name);
  }

  function naturalCompare(left, right) {
    var leftParts = String(left).split(/(\d+)/);
    var rightParts = String(right).split(/(\d+)/);
    var length = Math.max(leftParts.length, rightParts.length);

    for (var index = 0; index < length; index += 1) {
      var leftPart = leftParts[index] || "";
      var rightPart = rightParts[index] || "";
      if (leftPart === rightPart) continue;

      var leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null;
      var rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null;
      if (leftNumber !== null && rightNumber !== null) {
        return leftNumber - rightNumber;
      }
      return leftPart.localeCompare(rightPart, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    }

    return 0;
  }

  function sortComicPageNames(names) {
    return names.slice().sort(naturalCompare);
  }

  function patchCbrWorkerSource(workerSource, wasmUrl) {
    return workerSource.replace(
      /new URL\("libarchive\.wasm",import\.meta\.url\)\.href/g,
      JSON.stringify(wasmUrl)
    );
  }

  function getComicPreviewSize(width, height, maxWidth, maxHeight) {
    var safeWidth = Math.max(1, Number(width) || 1);
    var safeHeight = Math.max(1, Number(height) || 1);
    var widthLimit = maxWidth || 240;
    var heightLimit = maxHeight || 360;
    var scale = Math.min(1, widthLimit / safeWidth, heightLimit / safeHeight);
    return {
      width: Math.max(1, Math.round(safeWidth * scale)),
      height: Math.max(1, Math.round(safeHeight * scale)),
    };
  }

  function getComicPageAspectRatio(width, height) {
    var safeWidth = Math.max(1, Number(width) || 1);
    var safeHeight = Math.max(1, Number(height) || 1);
    return safeWidth + " / " + safeHeight;
  }

  function getProtectedComicPageIndexes(
    currentPage,
    visiblePageIndexes,
    loadingPageIndexes
  ) {
    var protectedIndexes = new Set([
      currentPage - 1,
      currentPage,
      currentPage - 2,
    ]);
    (visiblePageIndexes || []).forEach(function (pageIndex) {
      protectedIndexes.add(pageIndex);
    });
    (loadingPageIndexes || []).forEach(function (pageIndex) {
      protectedIndexes.add(pageIndex);
    });
    return protectedIndexes;
  }

  function isCurrentComicPageLoad(
    loadGeneration,
    currentGeneration,
    entry,
    currentEntry
  ) {
    return loadGeneration === currentGeneration && entry === currentEntry;
  }

  return {
    isComicImageName: isComicImageName,
    sortComicPageNames: sortComicPageNames,
    patchCbrWorkerSource: patchCbrWorkerSource,
    getComicPreviewSize: getComicPreviewSize,
    getComicPageAspectRatio: getComicPageAspectRatio,
    getProtectedComicPageIndexes: getProtectedComicPageIndexes,
    isCurrentComicPageLoad: isCurrentComicPageLoad,
  };
});
/* @papyrus-comic-runtime:end */

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
  let rotation = 0;
  let comicArchive = null;
  let comicEntries = [];
  let comicContainer = null;
  let comicPages = [];
  let comicObserver = null;
  let comicScrollFrame = null;
  const comicVisiblePages = new Set();
  const comicObjectUrls = new Map();
  const comicLoading = new Map();
  const comicDimensions = new Map();
  const comicPreviewCache = new Map();
  const comicPreviewLoading = new Map();
  const COMIC_CACHE_LIMIT = 16;
  const COMIC_PREVIEW_CACHE_LIMIT = 8;
  const comicHelpers = window.PapyrusComicRuntime || {};
  const runtimeConfig = window.__PAPYRUS_RUNTIME_CONFIG__ || {};
  const epubDiagnosticsEnabled =
    runtimeConfig.epubDiagnostics === true ||
    runtimeConfig.epubDiagnostics === 'true';
  const EPUB_STAGE_TIMEOUT_MS = 10000;
  let comicDispose = null;
  let comicGeneration = 0;
  let epubInteractionCleanup = null;
  let epubScrollDiagnostics = null;
  let epubLoadGeneration = 0;

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

  const runtimeAssetRequests = new Map();
  const fileChunkRequests = new Map();

  const requestRuntimeAsset = (url, encoding) =>
    new Promise((resolve, reject) => {
      const id = `runtime-asset-${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        runtimeAssetRequests.delete(id);
        reject(new Error(`Tempo esgotado ao carregar asset CBR: ${url}`));
      }, 15000);
      runtimeAssetRequests.set(id, {resolve, reject, timeout});
      sendMessage({type: 'asset-request', id, url, encoding});
    });

  const encodeArrayBufferAsDataUrl = async (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)),
      );
    }
    return `data:application/wasm;base64,${btoa(binary)}`;
  };

  const fetchRuntimeAsset = async (url, encoding) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`status ${response.status}`);
      if (encoding === 'text') return await response.text();
      return await encodeArrayBufferAsDataUrl(await response.arrayBuffer());
    } catch {
      return await requestRuntimeAsset(url, encoding);
    }
  };

  const requestLocalFileChunk = (uri, offset, length) =>
    new Promise((resolve, reject) => {
      const id = `file-chunk-${Date.now()}-${Math.random()}`;
      const timeout = setTimeout(() => {
        fileChunkRequests.delete(id);
        reject(new Error(`Tempo esgotado ao ler arquivo local: ${uri}`));
      }, 30000);
      fileChunkRequests.set(id, {resolve, reject, timeout});
      sendMessage({type: 'file-chunk-request', id, uri, offset, length});
    });

  const readLocalFile = async (uri) => {
    const chunkSize = 1024 * 1024;
    const chunks = [];
    let offset = 0;
    let totalLength = 0;
    while (true) {
      const result = await requestLocalFileChunk(uri, offset, chunkSize);
      const bytes = decodeBase64(result.data || '');
      if (bytes.length === 0 && !result.done) {
        throw new Error('Leitura nativa retornou um chunk vazio.');
      }
      chunks.push(bytes);
      totalLength += bytes.length;
      offset += bytes.length;
      if (result.done) break;
    }

    const output = new Uint8Array(totalLength);
    let outputOffset = 0;
    chunks.forEach((chunk) => {
      output.set(chunk, outputOffset);
      outputOffset += chunk.length;
    });
    return output.buffer;
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

  const sendEpubDiagnostic = (name, payload) => {
    if (!epubDiagnosticsEnabled) return;
    sendEvent(name, {
      loadId: payload.loadId,
      timestamp: Date.now(),
      sourceKind: payload.sourceKind,
      byteLength: payload.byteLength,
      currentType: currentType,
      durationMs: payload.durationMs,
      error: payload.error,
    });
  };

  const withEpubStageTimeout = (promise, stage, payload) =>
    new Promise((resolve, reject) => {
      let settled = false;
      const startedAt = performance.now();
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error(`EPUB ${stage} excedeu ${EPUB_STAGE_TIMEOUT_MS}ms`);
        sendEpubDiagnostic('epub.load.timeout', {
          ...payload,
          error: { message: error.message, stage },
          durationMs: performance.now() - startedAt,
        });
        reject(error);
      }, EPUB_STAGE_TIMEOUT_MS);

      Promise.resolve(promise).then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        },
      );
    });

  const isEpubDiagnosticsEnabled = () => {
    const configured = runtimeConfig.epubScrollDiagnostics;
    return configured === true || configured === '1' || configured === 'true' ||
      Boolean(window.__PAPYRUS_EPUB_SCROLL_DIAGNOSTICS__);
  };

  const createEpubScrollDiagnostics = (manager) => {
    if (!isEpubDiagnosticsEnabled()) return null;

    const state = {
      lastScrollTop: null,
      lastTouchY: null,
      lastTouchX: null,
      lastInputDeltaY: 0,
      touchActive: false,
      selectionActive: false,
      gestureLock: false,
      consecutiveStallSamples: 0,
      firstStallTimestamp: null,
      stallReported: false,
    };
    const container = manager && manager.container;

    const getSnapshot = () => {
      const scrollTop = Number(container && container.scrollTop) || 0;
      const scrollHeight = Number(container && container.scrollHeight) || 0;
      const clientHeight = Number(container && container.clientHeight) || 0;
      let scrollEnabled = true;
      try {
        const overflowY = window.getComputedStyle(container).overflowY;
        scrollEnabled = overflowY !== 'hidden' && overflowY !== 'clip';
      } catch (_) {}
      return { scrollTop, scrollHeight, clientHeight, scrollEnabled };
    };

    const emit = (name, payload) => {
      sendEvent(name, {
        timestamp: Date.now(),
        documentType: currentType,
        currentPage,
        spineIndex: Math.max(0, currentPage - 1),
        progress: pageCount > 0 ? currentPage / pageCount : null,
        ...(payload || {}),
      });
    };

    const resetStall = () => {
      state.consecutiveStallSamples = 0;
      state.firstStallTimestamp = null;
      state.stallReported = false;
    };

    const recordScroll = (event) => {
      const snapshot = getSnapshot();
      const previousScrollTop = state.lastScrollTop === null
        ? snapshot.scrollTop
        : state.lastScrollTop;
      const deltaY = state.lastInputDeltaY;
      const inputDirection = deltaY > 4 ? 'up' : deltaY < -4 ? 'down' : 'none';
      const offsetUnchanged = Math.abs(snapshot.scrollTop - previousScrollTop) <= 1;
      const validStallSample = inputDirection === 'up' &&
        snapshot.scrollTop > 2 &&
        snapshot.scrollEnabled &&
        !state.selectionActive &&
        !state.gestureLock &&
        offsetUnchanged;

      if (validStallSample) {
        state.consecutiveStallSamples += 1;
        if (state.firstStallTimestamp === null) {
          state.firstStallTimestamp = Date.now();
        }
        const durationMs = Date.now() - state.firstStallTimestamp;
        if (!state.stallReported && state.consecutiveStallSamples >= 3 && durationMs >= 150) {
          state.stallReported = true;
          emit('epub.scroll.stall', {
            ...snapshot,
            previousScrollTop,
            deltaY,
            direction: 'up',
            consecutiveSamples: state.consecutiveStallSamples,
            durationMs,
            selectionActive: state.selectionActive,
            gestureLock: state.gestureLock,
          });
        }
      } else if (!offsetUnchanged || inputDirection !== 'up') {
        resetStall();
      }

      state.lastScrollTop = snapshot.scrollTop;
      emit('epub.scroll', {
        ...snapshot,
        previousScrollTop,
        deltaY,
        direction: snapshot.scrollTop < previousScrollTop ? 'up' :
          snapshot.scrollTop > previousScrollTop ? 'down' : 'none',
        touchActive: state.touchActive,
        selectionActive: state.selectionActive,
        gestureLock: state.gestureLock,
      });
    };

    return {
      setSelectionActive(active) {
        state.selectionActive = Boolean(active);
        emit('epub.selection', { selectionActive: state.selectionActive });
      },
      setGestureLock(active) {
        state.gestureLock = Boolean(active);
        emit('epub.gesture-lock', { gestureLock: state.gestureLock });
      },
      touchStart(event) {
        const touch = event && event.touches && event.touches[0];
        state.touchActive = true;
        state.lastTouchY = touch ? Number(touch.clientY) : null;
        state.lastTouchX = touch ? Number(touch.clientX) : null;
        state.lastInputDeltaY = 0;
        resetStall();
        emit('epub.touch.start', { x: state.lastTouchX, y: state.lastTouchY });
      },
      touchMove(event) {
        const touch = event && event.touches && event.touches[0];
        if (!touch) return;
        const previousY = state.lastTouchY;
        const previousX = state.lastTouchX;
        state.lastTouchY = Number(touch.clientY);
        state.lastTouchX = Number(touch.clientX);
        state.lastInputDeltaY = previousY === null ? 0 : previousY - state.lastTouchY;
        emit('epub.touch.move', {
          x: state.lastTouchX,
          y: state.lastTouchY,
          deltaY: previousY === null ? 0 : previousY - state.lastTouchY,
          deltaX: previousX === null ? 0 : previousX - state.lastTouchX,
        });
        recordScroll();
      },
      touchEnd(event) {
        const touch = event && event.changedTouches && event.changedTouches[0];
        state.touchActive = false;
        emit('epub.touch.end', {
          x: touch ? Number(touch.clientX) : state.lastTouchX,
          y: touch ? Number(touch.clientY) : state.lastTouchY,
        });
        state.lastTouchY = null;
        state.lastTouchX = null;
        state.lastInputDeltaY = 0;
        resetStall();
      },
      scroll: recordScroll,
      relocated(location) {
        emit('epub.relocated', {
          href: location && location.start ? location.start.href || null : null,
          cfi: location && location.start ? location.start.cfi || null : null,
        });
      },
      settled(event) {
        emit('epub.momentum.settled', {
          scrollTop: Number(event && event.top) || 0,
        });
      },
      command(name, payload) {
        emit('epub.programmatic-scroll', { command: name, ...(payload || {}) });
      },
    };
  };

  const reportError = (error, context) => {
    const message = error && error.message ? error.message : String(error);
    const stack = error && error.stack ? error.stack : null;
    sendEvent('RUNTIME_ERROR', { message, context, stack });
  };

  const shouldIgnoreError = (error) => {
    const message = error && error.message ? error.message : String(error || '');
    return message.includes('ResizeObserver loop');
  };

  window.addEventListener('error', (event) => {
    const error = event.error || event.message;
    if (shouldIgnoreError(error)) return;
    reportError(error, 'window.error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (shouldIgnoreError(event.reason)) return;
    reportError(event.reason, 'unhandledrejection');
  });

  const clearComicState = () => {
    comicGeneration += 1;
    if (comicObserver) {
      comicObserver.disconnect();
      comicObserver = null;
    }
    if (comicScrollFrame !== null) {
      cancelAnimationFrame(comicScrollFrame);
      comicScrollFrame = null;
    }
    comicObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    comicObjectUrls.clear();
    comicLoading.clear();
    comicVisiblePages.clear();
    comicDimensions.clear();
    comicPreviewCache.clear();
    comicPreviewLoading.clear();
    if (comicDispose) {
      void comicDispose();
      comicDispose = null;
    }
    comicArchive = null;
    comicEntries = [];
    comicContainer = null;
    comicPages = [];
  };

  const clearViewer = () => {
    if (epubInteractionCleanup) {
      epubInteractionCleanup();
      epubInteractionCleanup = null;
    }
    clearComicState();
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

   const toExactArrayBuffer = (bytes) => {
     if (
       bytes.byteOffset === 0 &&
       bytes.byteLength === bytes.buffer.byteLength
     ) {
       return bytes.buffer;
     }
     return bytes.buffer.slice(
       bytes.byteOffset,
       bytes.byteOffset + bytes.byteLength
     );
   };

  const decodeBase64ToText = (value) => {
    const bytes = decodeBase64(value);
    return new TextDecoder('utf-8').decode(bytes);
  };

  const sourceToArrayBuffer = async (source) => {
    if (source.kind === 'uri') {
      if (/^(?:file|content):\/\//i.test(source.uri)) {
        return readLocalFile(source.uri);
      }
      const response = await fetch(source.uri);
      if (!response.ok && response.status !== 0) {
        throw new Error(`Falha ao carregar quadrinho (${response.status})`);
      }
      return response.arrayBuffer();
     }
     if (source.kind === 'base64') {
       return toExactArrayBuffer(decodeBase64(source.data));
     }
    throw new Error('Fonte de quadrinho inválida.');
  };

  const comicMimeType = (name) => {
    const extension = name.split('.').pop()?.toLowerCase();
    if (extension === 'png') return 'image/png';
    if (extension === 'gif') return 'image/gif';
    if (extension === 'svg') return 'image/svg+xml';
    if (extension === 'webp') return 'image/webp';
    return 'image/jpeg';
  };

  const updateComicCurrentPage = () => {
    if (!comicContainer || comicPages.length === 0) return;
    const viewportTop = comicContainer.scrollTop;
    let closestIndex = currentPage - 1;
    let closestDistance = Number.POSITIVE_INFINITY;
    comicPages.forEach((page, index) => {
      const distance = Math.abs(page.offsetTop - viewportTop);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    const nextPage = Math.max(1, Math.min(pageCount, closestIndex + 1));
    if (nextPage !== currentPage) {
      currentPage = nextPage;
      sendState();
    }
  };

  const scheduleComicCurrentPage = () => {
    if (comicScrollFrame !== null) return;
    comicScrollFrame = requestAnimationFrame(() => {
      comicScrollFrame = null;
      updateComicCurrentPage();
    });
  };

  const evictComicUrls = () => {
    if (comicObjectUrls.size <= COMIC_CACHE_LIMIT) return;
    const protectedIndexes = comicHelpers.getProtectedComicPageIndexes(
      currentPage,
      Array.from(comicVisiblePages),
      Array.from(comicLoading.keys())
    );
    for (const [index, url] of comicObjectUrls) {
      if (comicObjectUrls.size <= COMIC_CACHE_LIMIT) break;
      if (protectedIndexes.has(index)) continue;
      URL.revokeObjectURL(url);
      comicObjectUrls.delete(index);
      const image = comicPages[index]?.querySelector('img');
      const page = comicPages[index];
      const dimensions = comicDimensions.get(index);
      const width = dimensions?.width || image?.naturalWidth || 0;
      const height = dimensions?.height || image?.naturalHeight || 0;
      if (page && width > 0 && height > 0) {
        page.style.aspectRatio = comicHelpers.getComicPageAspectRatio(
          width,
          height
        );
      }
      if (image) image.removeAttribute('src');
    }
  };

  const ensureComicPage = async (pageIndex) => {
    if (comicObjectUrls.has(pageIndex)) {
      const image = comicPages[pageIndex]?.querySelector('img');
      if (image && !image.src) image.src = comicObjectUrls.get(pageIndex);
      return comicObjectUrls.get(pageIndex);
    }
    if (comicLoading.has(pageIndex)) return comicLoading.get(pageIndex);

    const entry = comicEntries[pageIndex];
    if (!entry) throw new Error(`Página de quadrinho inválida: ${pageIndex}`);
    const loadGeneration = comicGeneration;
    const pending = entry.async('blob').then((blob) => {
      if (
        !comicHelpers.isCurrentComicPageLoad(
          loadGeneration,
          comicGeneration,
          entry,
          comicEntries[pageIndex]
        )
      ) {
        return null;
      }
      const url = URL.createObjectURL(
        new Blob([blob], { type: comicMimeType(entry.name) })
      );
      comicObjectUrls.set(pageIndex, url);
      const image = comicPages[pageIndex]?.querySelector('img');
      if (image) image.src = url;
      evictComicUrls();
      return url;
    });
    comicLoading.set(pageIndex, pending);
    try {
      return await pending;
    } finally {
      if (comicLoading.get(pageIndex) === pending) {
        comicLoading.delete(pageIndex);
        evictComicUrls();
      }
    }
  };

  const renderComicPage = (pageIndex) => {
    const image = comicPages[pageIndex]?.querySelector('img');
    if (!image) return;
    image.style.width = `${Math.max(40, Math.round(100 * zoom))}%`;
    image.style.transform = `rotate(${rotation}deg)`;
  };

  const applyComicLayout = () => {
    comicPages.forEach((_, pageIndex) => renderComicPage(pageIndex));
  };

  const loadComic = async (source, format) => {
    clearViewer();
    let entries;
    if (format === 'cbr') {
      const clientUrl = runtimeConfig.cbrClientUrl;
      const workerUrl = runtimeConfig.cbrWorkerUrl;
      const wasmUrl = runtimeConfig.cbrWasmUrl;
      if (!clientUrl || !workerUrl || !wasmUrl) {
        throw new Error(
          'CBR no mobile exige o pacote opcional de runtime libarchive.'
        );
      }

            const [clientSource, workerSource, wasmSource] = await Promise.all([
              fetchRuntimeAsset(clientUrl, 'text'),
              fetchRuntimeAsset(workerUrl, 'text'),
              runtimeConfig.cbrWasmDataUrl ||
                fetchRuntimeAsset(wasmUrl, 'base64'),
            ]);
            const patchedWorkerSource = comicHelpers.patchCbrWorkerSource(
              workerSource,
              wasmSource
            );
      const workerObjectUrl = URL.createObjectURL(
        new Blob([patchedWorkerSource], { type: 'text/javascript' })
      );
      const clientObjectUrl = URL.createObjectURL(
        new Blob([clientSource], { type: 'text/javascript' })
      );
      try {
        const archiveModule = await import(clientObjectUrl);
        const createCbrWorker = () => {
          const worker = new Worker(workerObjectUrl, {type: 'module'});
          worker.addEventListener('error', (event) => {
            sendEvent('RUNTIME_ERROR', {
              message: `CBR worker: ${event?.message || 'falha ao executar o worker'}`,
              context: 'comic.worker',
            });
          });
          worker.addEventListener('messageerror', () => {
            sendEvent('RUNTIME_ERROR', {
              message: 'CBR worker: falha ao transferir mensagem',
              context: 'comic.worker',
            });
          });
          return worker;
        };
        archiveModule.Archive.init({ getWorker: createCbrWorker });
        const bytes = await sourceToArrayBuffer(source);
        const file = new Blob([bytes], {
          type: 'application/vnd.comicbook-rar',
        });
        const archive = await archiveModule.Archive.open(file);
        const files = await archive.getFilesArray();
        entries = files
          .filter(
            (item) => {
              const name = `${item?.path || ''}${item?.file?.name || ''}`;
              return item?.file && comicHelpers.isComicImageName(name);
            }
          )
          .map((item) => {
            const name = `${item.path || ''}${item.file.name}`;
            return {
              name,
              async: async () => item.file.extract(),
            };
          });
        comicDispose = async () => {
          await archive.close();
          URL.revokeObjectURL(workerObjectUrl);
          URL.revokeObjectURL(clientObjectUrl);
        };
      } catch (error) {
        URL.revokeObjectURL(workerObjectUrl);
        URL.revokeObjectURL(clientObjectUrl);
        throw error;
      }
    } else {
      if (!window.JSZip) {
        throw new Error('O runtime ZIP do leitor mobile não foi carregado.');
      }

      const bytes = await sourceToArrayBuffer(source);
      comicArchive = await window.JSZip.loadAsync(bytes);
      entries = Object.keys(comicArchive.files)
        .filter((name) => {
          const entry = comicArchive.files[name];
          return !entry.dir && comicHelpers.isComicImageName(name);
        })
        .map((name) => comicArchive.files[name]);
    }

    const names = comicHelpers.sortComicPageNames(
      entries.map((entry) => entry.name)
    );
    const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
    comicEntries = names.map((name) => entriesByName.get(name));
    if (comicEntries.length === 0) {
      if (comicDispose) {
        await comicDispose();
        comicDispose = null;
      }
      throw new Error('O arquivo não contém páginas de imagem.');
    }

    comicContainer = document.createElement('div');
    comicContainer.style.width = '100%';
    comicContainer.style.height = '100%';
    comicContainer.style.overflow = 'auto';
    comicContainer.style.padding = '16px 0 120px';
    comicContainer.style.boxSizing = 'border-box';
    comicContainer.style.background = '#ffffff';
    comicContainer.addEventListener('scroll', scheduleComicCurrentPage, {
      passive: true,
    });
    viewer.style.overflow = 'hidden';
    viewer.appendChild(comicContainer);

    comicPages = comicEntries.map((entry, pageIndex) => {
      const page = document.createElement('div');
      page.dataset.pageIndex = String(pageIndex);
      page.style.width = '100%';
      page.style.minHeight = '80px';
      page.style.display = 'flex';
      page.style.justifyContent = 'center';
      page.style.alignItems = 'flex-start';
      page.style.padding = '0 12px 20px';
      page.style.boxSizing = 'border-box';

      const image = document.createElement('img');
      image.alt = `Página ${pageIndex + 1}`;
      image.draggable = false;
      image.decoding = 'async';
      image.loading = 'lazy';
      image.style.display = 'block';
      image.style.maxWidth = 'none';
      image.style.height = 'auto';
      image.style.userSelect = 'none';
      image.addEventListener('load', () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          comicDimensions.set(pageIndex, {
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
          page.style.aspectRatio = comicHelpers.getComicPageAspectRatio(
            image.naturalWidth,
            image.naturalHeight
          );
        }
      });
      page.appendChild(image);
      comicContainer.appendChild(page);
      return page;
    });

    if (typeof IntersectionObserver === 'function') {
      comicObserver = new IntersectionObserver(
        (observations) => {
          observations.forEach((observation) => {
            const pageIndex = Number(observation.target.dataset.pageIndex);
            if (!observation.isIntersecting) {
              comicVisiblePages.delete(pageIndex);
              return;
            }
            comicVisiblePages.add(pageIndex);
            void ensureComicPage(pageIndex).catch((error) =>
              sendEvent('RUNTIME_ERROR', {
                message: error?.message || String(error),
                context: 'comic.page',
              })
            );
          });
          scheduleComicCurrentPage();
        },
        { root: comicContainer, rootMargin: '600px 0px' }
      );
      comicPages.forEach((page) => comicObserver.observe(page));
    } else {
      for (let pageIndex = 0; pageIndex < Math.min(3, comicPages.length); pageIndex += 1) {
        void ensureComicPage(pageIndex);
      }
    }
    pageCount = comicPages.length;
    currentPage = 1;
    await ensureComicPage(0);
    applyComicLayout();
    return { pageCount };
  };

  const readComicBlobAsDataUrl = (blob, mimeType) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao gerar preview.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(new Blob([blob], { type: mimeType }));
    });

  const createComicPagePreview = async (pageIndex) => {
    const entry = comicEntries[pageIndex];
    if (!entry) return null;
    const mimeType = comicMimeType(entry.name);
    const sourceUrl = await ensureComicPage(pageIndex);
    if (!sourceUrl) return null;
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Falha ao decodificar preview.'));
        image.src = sourceUrl;
      });
      const size = comicHelpers.getComicPreviewSize(
        image.naturalWidth || image.width,
        image.naturalHeight || image.height
      );
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponível para preview.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(image, 0, 0, size.width, size.height);
      return canvas.toDataURL('image/jpeg', 0.78);
    } catch {
      try {
        const response = await fetch(sourceUrl);
        const blob = await response.blob();
        return await readComicBlobAsDataUrl(blob, mimeType);
      } catch {
        return null;
      }
    }
  };

  const getComicPagePreview = async (pageIndex) => {
    const entry = comicEntries[pageIndex];
    if (!entry) return null;
    if (comicPreviewCache.has(pageIndex)) {
      return comicPreviewCache.get(pageIndex);
    }
    if (comicPreviewLoading.has(pageIndex)) {
      return comicPreviewLoading.get(pageIndex);
    }
    const loadGeneration = comicGeneration;
    const pending = createComicPagePreview(pageIndex).then((preview) => {
      if (
        !comicHelpers.isCurrentComicPageLoad(
          loadGeneration,
          comicGeneration,
          entry,
          comicEntries[pageIndex]
        )
      ) {
        return null;
      }
      comicPreviewCache.set(pageIndex, preview);
      while (comicPreviewCache.size > COMIC_PREVIEW_CACHE_LIMIT) {
        comicPreviewCache.delete(comicPreviewCache.keys().next().value);
      }
      return preview;
    });
    comicPreviewLoading.set(pageIndex, pending);
    try {
      return await pending;
    } finally {
      if (comicPreviewLoading.get(pageIndex) === pending) {
        comicPreviewLoading.delete(pageIndex);
      }
    }
  };

  const getComicPageDimensions = async (pageIndex) => {
    const known = comicDimensions.get(pageIndex);
    if (known) return known;
    await ensureComicPage(pageIndex);
    const image = comicPages[pageIndex]?.querySelector('img');
    if (image && !image.complete) {
      await new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    }
    return (
      comicDimensions.get(pageIndex) || {
        width: image?.naturalWidth || 0,
        height: image?.naturalHeight || 0,
      }
    );
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

  const loadEpub = async (source, loadId, generation) => {
    const diagnosticPayload = {
      loadId,
      sourceKind: source.kind,
    };
    const isCurrentLoad = () => generation === epubLoadGeneration;
    sendEpubDiagnostic('epub.load.start', diagnosticPayload);

    if (epubInteractionCleanup) {
      epubInteractionCleanup();
      epubInteractionCleanup = null;
    }
    if (rendition && typeof rendition.destroy === 'function') {
      rendition.destroy();
    }
    if (book && typeof book.destroy === 'function') {
      book.destroy();
    }

    let data = null;
    if (source.kind === 'uri') {
      data = await withEpubStageTimeout(
        sourceToArrayBuffer(source),
        'source',
        diagnosticPayload,
      );
    } else if (source.kind === 'base64') {
      // epub.js expects an ArrayBuffer for binary books. Passing the decoded
      // Uint8Array directly can leave `book.ready` pending in Android WebView.
      data = toExactArrayBuffer(decodeBase64(source.data));
    } else if (source.kind === 'text') {
      const encoder = new TextEncoder();
      data = encoder.encode(source.text || '').buffer;
    }

    if (!isCurrentLoad()) throw new Error('EPUB load superseded by a newer load');
    sendEpubDiagnostic('epub.source.received', {
      ...diagnosticPayload,
      byteLength: data?.byteLength,
    });
    sendEpubDiagnostic('epub.source.decoded', {
      ...diagnosticPayload,
      byteLength: data?.byteLength,
    });
    book = ePub(data);
    sendEpubDiagnostic('epub.book.created', {
      ...diagnosticPayload,
      byteLength: data?.byteLength,
    });
    sendEpubDiagnostic('epub.book.ready.start', diagnosticPayload);
    await withEpubStageTimeout(book.ready, 'book.ready', diagnosticPayload);
    if (!isCurrentLoad()) throw new Error('EPUB load superseded by a newer load');
    sendEpubDiagnostic('epub.book.ready.end', diagnosticPayload);

    spineItems = book.spine && book.spine.items ? book.spine.items : [];
    pageCount = spineItems.length;
    currentPage = 1;
    sendEpubDiagnostic('epub.spine.ready', {
      ...diagnosticPayload,
      pageCount,
    });

    clearViewer();
    rendition = book.renderTo(viewer, {
      manager: 'continuous',
      width: '100%',
      height: '100%',
      flow: 'scrolled-continuous',
      spread: 'none',
    });
    sendEpubDiagnostic('epub.rendition.created', diagnosticPayload);

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
          epubScrollDiagnostics && epubScrollDiagnostics.setSelectionActive(true);
          sendEvent('TEXT_SELECTED', { text, pageIndex: Math.max(0, currentPage - 1) });
        }
        if (rendition && rendition.annotations && typeof rendition.annotations.remove === 'function') {
          rendition.annotations.remove(cfiRange, 'highlight');
        }
      });
      rendition.on('relocated', (location) => {
        const start = location && location.start;
        let index = start && Number.isInteger(start.index) ? start.index : -1;
        if (index < 0 && start && start.href) index = getSpineIndexByHref(start.href);
        if (index < 0 || index >= spineItems.length) return;
        epubScrollDiagnostics && epubScrollDiagnostics.relocated(location);
        const nextPage = index + 1;
        if (nextPage === currentPage) return;
        currentPage = nextPage;
        sendState();
      });
    }

    sendEpubDiagnostic('epub.display.start', diagnosticPayload);
    await withEpubStageTimeout(
      displayEpubPage(0),
      'rendition.display',
      diagnosticPayload,
    );
    if (!isCurrentLoad()) throw new Error('EPUB load superseded by a newer load');
    sendEpubDiagnostic('epub.display.end', diagnosticPayload);
    if (
      rendition &&
      rendition.manager &&
      typeof rendition.manager.on === 'function' &&
      typeof rendition.on === 'function'
    ) {
      let touchStart = null;
      let lastScrollOffset = -1;
      const manager = rendition.manager;
      epubScrollDiagnostics = createEpubScrollDiagnostics(manager);

      // ContinuousManager schedules a check for every debounced scroll event.
      // During a fast direction change, obsolete checks can queue behind view
      // append/prepend work and delay the next user scroll. Keep one check in
      // flight and let a later real scroll request another check.
      if (manager.q && typeof manager.q.enqueue === 'function') {
        const originalEnqueue = manager.q.enqueue.bind(manager.q);
        let pendingCheck = null;
        manager.q.enqueue = (task, ...args) => {
          const isCheckTask = typeof task === 'function' &&
            /\bthis\.check\(\)/.test(String(task));
          if (!isCheckTask) return originalEnqueue(task, ...args);
          if (pendingCheck) return Promise.resolve(false);
          const result = originalEnqueue(task, ...args);
          pendingCheck = Promise.resolve(result).finally(() => {
            pendingCheck = null;
          });
          if (epubScrollDiagnostics) {
            epubScrollDiagnostics.command('manager.check', {
              queueLength: typeof manager.q.length === 'function' ? manager.q.length() : null,
            });
          }
          return pendingCheck;
        };
      }
      const getTouchPoint = (event) => {
        const touch =
          (event && event.changedTouches && event.changedTouches[0]) ||
          (event && event.touches && event.touches[0]);
        if (!touch) return null;
        const x = Number(touch.screenX ?? touch.clientX);
        const y = Number(touch.screenY ?? touch.clientY);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      };
      const handleScroll = (event) => {
        const offsetY = Math.max(0, Number(event && event.top) || 0);
        epubScrollDiagnostics && epubScrollDiagnostics.scroll(event);
        if (Math.abs(offsetY - lastScrollOffset) < 1) return;
        lastScrollOffset = offsetY;
        sendEvent('VIEWER_SCROLL', { offsetY });
      };
      const handleTouchStart = (event) => {
        touchStart = getTouchPoint(event);
        epubScrollDiagnostics && epubScrollDiagnostics.touchStart(event);
      };
      const handleTouchMove = (event) => {
        epubScrollDiagnostics && epubScrollDiagnostics.touchMove(event);
      };
      const handleTouchEnd = (event) => {
        const end = getTouchPoint(event);
        const start = touchStart;
        touchStart = null;
        if (start && end && Math.hypot(end.x - start.x, end.y - start.y) <= 12) {
          sendEvent('VIEWER_TAP', {});
        }
        epubScrollDiagnostics && epubScrollDiagnostics.touchEnd(event);
      };

      manager.on('scroll', handleScroll);
      const handleScrolled = (event) => {
        epubScrollDiagnostics && epubScrollDiagnostics.settled(event);
      };
      manager.on('scrolled', handleScrolled);
      rendition.on('touchstart', handleTouchStart);
      rendition.on('touchmove', handleTouchMove);
      rendition.on('touchend', handleTouchEnd);
      epubInteractionCleanup = () => {
        if (typeof manager.off === 'function') manager.off('scroll', handleScroll);
        if (typeof manager.off === 'function') manager.off('scrolled', handleScrolled);
        if (typeof rendition.off === 'function') {
          rendition.off('touchstart', handleTouchStart);
          rendition.off('touchmove', handleTouchMove);
          rendition.off('touchend', handleTouchEnd);
        }
        epubScrollDiagnostics = null;
      };
    }
    applyEpubZoom();

    const outline = await withEpubStageTimeout(
      buildOutline(),
      'outline',
      diagnosticPayload,
    );
    sendEpubDiagnostic('epub.load.ready', {
      ...diagnosticPayload,
      pageCount,
    });
    return { pageCount, outline };
  };

  const displayEpubPage = async (pageIndex) => {
    if (!rendition) return;
    const item = spineItems[pageIndex];
    if (!item) return;
    const target = item.href || item.idref || item.cfiBase || pageIndex;
    epubScrollDiagnostics && epubScrollDiagnostics.command('display', {
      target,
      pageIndex,
    });
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
    if (!dest) return null;
    if (typeof dest === 'string') return getSpineIndexByHref(dest);
    if (typeof dest !== 'object') return null;
    if (dest.kind === 'href') return getSpineIndexByHref(dest.value);
    if (dest.kind === 'pageIndex') return dest.value;
    if (dest.kind === 'pageNumber') return Math.max(0, dest.value - 1);
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
    } else if (currentType === 'comic') {
      applyComicLayout();
    }
  };

  const handleCommand = async (message) => {
    const { id, kind, payload } = message;

    try {
      if (kind === 'load') {
        const generation = (epubLoadGeneration += 1);
        currentType = payload.type;
        zoom = 1.0;

        if (currentType === 'text') {
          const result = await loadText(payload.source);
          sendState();
          sendResponse(id, true, result);
          return;
        }

        if (currentType === 'epub') {
          const result = await loadEpub(payload.source, id, generation);
          sendEvent('document.ready', {
            loadId: id,
            pageCount: result.pageCount,
          });
          sendState({ outline: result.outline || [] });
          sendResponse(id, true, result);
          return;
        }

        if (currentType === 'comic') {
          const result = await loadComic(payload.source, payload.format || 'cbz');
          sendState();
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
        } else if (currentType === 'comic') {
          currentPage = page;
          const target = comicPages[page - 1];
          if (target) {
            await ensureComicPage(page - 1);
            target.scrollIntoView({ block: 'start' });
            renderComicPage(page - 1);
            sendState();
          }
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
        rotation = ((payload.rotation || 0) % 360 + 360) % 360;
        if (currentType === 'comic') applyComicLayout();
        sendResponse(id, true, {});
        return;
      }

      if (kind === 'get-text-content') {
        const items = await getTextContent(payload.pageIndex || 0);
        sendResponse(id, true, items);
        return;
      }

      if (kind === 'get-page-dimensions') {
        if (currentType === 'comic') {
          sendResponse(
            id,
            true,
            await getComicPageDimensions(payload.pageIndex || 0)
          );
        } else {
          sendResponse(id, true, getPageDimensions());
        }
        return;
      }

      if (kind === 'get-page-preview') {
        if (currentType !== 'comic') {
          sendResponse(id, true, null);
          return;
        }
        sendResponse(
          id,
          true,
          await getComicPagePreview(payload.pageIndex || 0)
        );
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
      const errorMessage = err && err.message ? err.message : String(err);
      if (kind === 'load' && payload?.type === 'epub') {
        sendEpubDiagnostic('epub.load.error', {
          loadId: id,
          sourceKind: payload.source?.kind,
          error: { message: errorMessage, stack: err?.stack || null },
        });
        sendEvent('document.error', {
          loadId: id,
          error: { message: errorMessage, stack: err?.stack || null },
        });
      }
      sendResponse(id, false, null, errorMessage);
    }
  };

  const onMessage = (event) => {
    let message = null;
    const raw = event && typeof event === 'object' ? event.data : null;

    if (raw && typeof raw === 'object' && (raw.kind || raw.type) && raw.id) {
      message = raw;
    } else if (typeof raw === 'string') {
      if (raw.startsWith('setImmediate$')) return;
      const trimmed = raw.trim();
      if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
        return;
      }
      try {
        message = JSON.parse(trimmed);
      } catch (err) {
        return;
      }
    } else {
      return;
    }

    if (!message || message.id == null) return;

    if (message.type === 'asset-response') {
      const pending = runtimeAssetRequests.get(message.id);
      if (!pending) return;
      runtimeAssetRequests.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.ok) pending.resolve(message.data);
      else pending.reject(new Error(message.error || 'Falha ao carregar asset CBR.'));
      return;
    }

    if (message.type === 'file-chunk-response') {
      const pending = fileChunkRequests.get(message.id);
      if (!pending) return;
      fileChunkRequests.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.ok) pending.resolve(message);
      else pending.reject(new Error(message.error || 'Falha ao ler arquivo local.'));
      return;
    }

    if (!message.kind) return;
    handleCommand(message);
  };

  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);

  sendMessage({ type: 'ready' });
})();
