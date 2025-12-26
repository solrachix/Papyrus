
import React, { useEffect, useMemo, useState } from 'react';
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
const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialPage: 1,
  initialZoom: 1.0,
  initialAccentColor: ACCENT_COLOR,
  sidebarLeftOpen: true,
  initialAnnotations:  [
                        {
                          id: 'mock-1',
                          pageIndex: 3,
                          type: 'text',
                          color: '#3b82f6',
                          content: 'Esta nota foi carregada via configuração inicial!',
                          rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
                          createdAt: Date.now()
                        }
                      ]
};

const App: React.FC = () => {
  const [loadError, setLoadError] = useState<string | null>(null);
    const [engine] = useState(() => new PDFJSEngine());
//  const engine = useMemo(() => new PDFJSEngine(), []);
  // Troque manualmente quando quiser:
  // const engine = useMemo(() => new EPUBEngine(), []);
  // const engine = useMemo(() => new TextEngine(), []);

  const DEMO_KIND: 'pdf' | 'epub' | 'text' = 'pdf';
  const DEMO_SOURCE = DEMO_KIND === 'pdf'
    ? LOCAL_PDF_URL
    : DEMO_KIND === 'epub'
      ? LOCAL_EPUB_URL
      : LOCAL_TEXT_URL;

  const { isLoaded, setDocumentState, initializeStore, triggerScrollToPage } = useViewerStore();

  useEffect(() => {
    initializeStore(INITIAL_SDK_CONFIG);

    // Eventos Globais do SDK
    const unsubDoc = papyrusEvents.on(PapyrusEventType.DOCUMENT_LOADED, (p) => {
      console.log(`[SDK] Documento pronto: ${p.pageCount} pgs`);
    });

    // DEMO: Capturando a seleção de texto do usuário
    const unsubSelection = papyrusEvents.on(PapyrusEventType.TEXT_SELECTED, (payload) => {
      console.log(`[SDK] Texto selecionado na pág ${payload.pageIndex + 1}: "${payload.text}"`);
    });

    const init = async () => {
      try {
//        setDocumentState({ isLoaded: false, pageCount: 0, outline: [] });
//        setLoadError(null);
        await engine.load(DEMO_SOURCE);
//        const source = `${DEMO_SOURCE}${DEMO_SOURCE.includes('?') ? '&' : '?'}v=${Date.now()}`;
//        if (DEMO_KIND === 'text') {
//          const res = await fetch(source, { cache: 'no-store' });
//          const text = await res.text();
//          await engine.load(text);
//        } else if (DEMO_KIND === 'epub') {
//          const res = await fetch(source, { cache: 'no-store' });
//          const data = await res.arrayBuffer();
//          await engine.load({ data });
//        } else {
//          const res = await fetch(source, { cache: 'no-store' });
//          const data = await res.arrayBuffer();
//          await engine.load({ data });
//        }
        
        if (INITIAL_SDK_CONFIG.initialZoom) engine.setZoom(INITIAL_SDK_CONFIG.initialZoom);
        if (INITIAL_SDK_CONFIG.initialPage) engine.goToPage(INITIAL_SDK_CONFIG.initialPage);

//        const pageCount = engine.getPageCount();
//        if (pageCount <= 0) {
//          setLoadError('Documento sem paginas ou falha ao inicializar.');
//          setDocumentState({ isLoaded: false, pageCount: 0, outline: [] });
//          return;
//        }

        setDocumentState({
          isLoaded: true,
          pageCount: engine.getPageCount(),
          outline: await engine.getOutline(),
//          currentPage: Math.min(INITIAL_SDK_CONFIG.initialPage ?? 1, pageCount),
        });

        if (INITIAL_SDK_CONFIG.initialPage) {
           setTimeout(() => triggerScrollToPage(INITIAL_SDK_CONFIG.initialPage! - 1), 500);
        }
      } catch (err) {
        console.error('Papyrus Engine Init Failed', err);
        setLoadError('Falha ao carregar o documento padrao.');
      }
    };
    init();

    return () => {
      engine.destroy();
      unsubDoc();
      unsubSelection();
    };
  }, [engine, initializeStore, setDocumentState, triggerScrollToPage]);

//  useEffect(() => () => engine.destroy(), [engine]);

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
