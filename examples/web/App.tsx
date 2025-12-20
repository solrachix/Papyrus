
import React, { useEffect, useState } from 'react';
import { PDFJSEngine } from '../../packages/engine-pdfjs/index';
import { useViewerStore, papyrusEvents } from '../../packages/core/index';
import { PapyrusEventType, PapyrusConfig, Annotation } from '../../packages/types/index';
import { Topbar, SidebarLeft, SidebarRight, Viewer } from '../../packages/ui-react/index';

const DEFAULT_PDF = 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';

const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialPage: 4,
  initialZoom: 1.2,
  sidebarLeftOpen: true,
  initialAnnotations: [
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
  const [engine] = useState(() => new PDFJSEngine());
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
        await engine.load(DEFAULT_PDF);
        
        if (INITIAL_SDK_CONFIG.initialZoom) engine.setZoom(INITIAL_SDK_CONFIG.initialZoom);
        if (INITIAL_SDK_CONFIG.initialPage) engine.goToPage(INITIAL_SDK_CONFIG.initialPage);

        setDocumentState({
          isLoaded: true,
          pageCount: engine.getPageCount(),
          outline: await engine.getOutline()
        });

        if (INITIAL_SDK_CONFIG.initialPage) {
           setTimeout(() => triggerScrollToPage(INITIAL_SDK_CONFIG.initialPage! - 1), 500);
        }
      } catch (err) {
        console.error('Papyrus Engine Init Failed', err);
      }
    };
    init();

    return () => {
      engine.destroy();
      unsubDoc();
      unsubSelection();
    };
  }, [engine, initializeStore, setDocumentState, triggerScrollToPage]);

  if (!isLoaded) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#1a1a1a] text-blue-500 font-mono">
      <div className="w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
      <span className="text-[10px] font-black tracking-[0.3em] uppercase animate-pulse">Initializing Papyrus SDK...</span>
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
