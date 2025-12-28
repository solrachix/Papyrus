
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';
import { EPUBEngine } from '@papyrus-sdk/engine-epub';
import { TextEngine } from '@papyrus-sdk/engine-text';
import { useViewerStore, papyrusEvents } from '@papyrus-sdk/core';
import { PapyrusEventType, PapyrusConfig } from '@papyrus-sdk/types';
import { Topbar, SidebarLeft, SidebarRight, Viewer } from '@papyrus-sdk/ui-react';

const LOCAL_PDF_URL = new URL('./assets/tracemonkey-pldi-09.pdf', import.meta.url).toString();
const LOCAL_EPUB_URL = new URL('./assets/sample.epub', import.meta.url).toString();
const LOCAL_TEXT_URL = new URL('./assets/sample.txt', import.meta.url).toString();

const ACCENT_COLOR = '#2563eb';
const createInitialConfig = (isEmbedded: boolean): PapyrusConfig => ({
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialPage: 1,
  initialZoom: 1.0,
  initialAccentColor: ACCENT_COLOR,
  sidebarLeftOpen: !isEmbedded,
  sidebarRightOpen: false,
  initialAnnotations: [
    {
      id: 'mock-1',
      pageIndex: 3,
      type: 'text',
      color: '#3b82f6',
      content: 'Esta nota foi carregada via configuracao inicial!',
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      createdAt: Date.now()
    }
  ]
});

type EngineKind = 'pdf' | 'epub' | 'text';

type DemoMessage = {
  source?: string;
  action?: string;
  value?: unknown;
  payload?: Record<string, unknown> | null;
};

const App: React.FC = () => {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [engineKind, setEngineKind] = useState<EngineKind>('pdf');
  const [eventLogEnabled, setEventLogEnabled] = useState(false);
  const storeInitializedRef = useRef(false);
  const isEmbedded = useMemo(
    () => typeof window !== 'undefined' && window.parent && window.parent !== window,
    []
  );
  const initialConfig = useMemo(() => createInitialConfig(isEmbedded), [isEmbedded]);

  const engine = useMemo(() => {
    if (engineKind === 'epub') return new EPUBEngine();
    if (engineKind === 'text') return new TextEngine();
    return new PDFJSEngine();
  }, [engineKind]);

  const demoSource = useMemo(() => {
    if (engineKind === 'epub') return LOCAL_EPUB_URL;
    if (engineKind === 'text') return LOCAL_TEXT_URL;
    return LOCAL_PDF_URL;
  }, [engineKind]);

  const { isLoaded, setDocumentState, initializeStore, triggerScrollToPage } = useViewerStore();

  useEffect(() => {
    const sendEvent = (type: PapyrusEventType, payload: unknown) => {
      if (!eventLogEnabled) return;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: 'papyrus-demo',
            type: 'event',
            eventType: type,
            payload,
          },
          '*'
        );
      }
    };

    const unsubDoc = papyrusEvents.on(PapyrusEventType.DOCUMENT_LOADED, (payload) => {
      console.log(`[SDK] Documento pronto: ${payload.pageCount} pgs`);
      sendEvent(PapyrusEventType.DOCUMENT_LOADED, payload);
    });

    const unsubSelection = papyrusEvents.on(PapyrusEventType.TEXT_SELECTED, (payload) => {
      console.log(`[SDK] Texto selecionado na pag ${payload.pageIndex + 1}: "${payload.text}"`);
      sendEvent(PapyrusEventType.TEXT_SELECTED, payload);
    });

    return () => {
      unsubDoc();
      unsubSelection();
    };
  }, [eventLogEnabled]);

  const handleMessage = useCallback((event: MessageEvent<DemoMessage>) => {
    const data = event.data;
    if (!data || data.source !== 'papyrus-docs') return;
    if (import.meta.env.MODE !== 'docs' && window.parent === window) return;

    switch (data.action) {
      case 'set-ui-theme': {
        if (data.value === 'light' || data.value === 'dark') {
          setDocumentState({ uiTheme: data.value });
        }
        break;
      }
      case 'set-page-theme': {
        if (data.value === 'normal' || data.value === 'sepia' || data.value === 'dark' || data.value === 'high-contrast') {
          setDocumentState({ pageTheme: data.value });
        }
        break;
      }
      case 'set-locale': {
        if (data.value === 'en' || data.value === 'pt-BR') {
          setDocumentState({ locale: data.value });
        }
        break;
      }
      case 'set-engine': {
        if (data.value === 'pdf' || data.value === 'epub' || data.value === 'text') {
          setEngineKind(data.value as EngineKind);
        }
        break;
      }
      case 'set-event-log': {
        setEventLogEnabled(Boolean(data.value));
        break;
      }
      case 'set-zoom': {
        const nextZoom = typeof data.value === 'number' ? data.value : Number(data.value);
        if (Number.isFinite(nextZoom)) {
          engine.setZoom(nextZoom);
          setDocumentState({ zoom: nextZoom });
        }
        break;
      }
      case 'go-to-page': {
        const nextPage = typeof data.value === 'number' ? data.value : Number(data.value);
        if (Number.isFinite(nextPage)) {
          const page = Math.max(1, Math.min(engine.getPageCount(), Math.floor(nextPage)));
          engine.goToPage(page);
          setDocumentState({ currentPage: page });
          triggerScrollToPage(page - 1);
        }
        break;
      }
      default:
        break;
    }
  }, [engine, setDocumentState, setEngineKind, triggerScrollToPage]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  useEffect(() => {
    let active = true;

    if (!storeInitializedRef.current) {
      initializeStore(initialConfig);
      storeInitializedRef.current = true;
    }

    const init = async () => {
      try {
        setDocumentState({ isLoaded: false, pageCount: 0, outline: [], currentPage: 1 });
        setLoadError(null);

        await engine.load(demoSource);

        if (!active) return;

        if (initialConfig.initialZoom) engine.setZoom(initialConfig.initialZoom);
        const initialPage = initialConfig.initialPage ?? 1;
        if (initialPage) engine.goToPage(initialPage);

        const pageCount = engine.getPageCount();
        const outline = await engine.getOutline();

        setDocumentState({
          isLoaded: true,
          pageCount,
          outline,
          currentPage: Math.min(initialPage, pageCount || 1),
        });

        if (initialPage && pageCount > 0) {
          setTimeout(() => triggerScrollToPage(initialPage - 1), 500);
        }
      } catch (err) {
        console.error('Papyrus Engine Init Failed', err);
        setLoadError('Falha ao carregar o documento padrao.');
      }
    };

    init();

    return () => {
      active = false;
      engine.destroy();
    };
  }, [demoSource, engine, initializeStore, setDocumentState, triggerScrollToPage, initialConfig]);
  if (!isLoaded) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#1a1a1a] font-mono" style={{ color: ACCENT_COLOR }}>
      <div className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mb-4" style={{ borderColor: ACCENT_COLOR }} />
      <span className="text-[10px] font-black tracking-[0.3em] uppercase animate-pulse">Initializing Papyrus SDK...</span>
      {loadError && (
        <div className="mt-3 text-[11px] text-red-300">{loadError}</div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-100">
      <Topbar engine={engine} />
      <div className="flex flex-1 overflow-hidden">
        <SidebarLeft engine={engine} />
        <Viewer engine={engine} />
        <SidebarRight engine={engine} />
      </div>
    </div>
  );
};
export default App;
