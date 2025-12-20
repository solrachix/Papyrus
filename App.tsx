
import React, { useEffect, useState } from 'react';
import { PDFJSEngine } from './packages/engine-pdfjs/index';
import { useViewerStore } from './packages/core/index';
import { Topbar, SidebarLeft, SidebarRight, Viewer } from './packages/ui-react/index';

const DEFAULT_PDF = 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf';

const App: React.FC = () => {
  const [engine] = useState(() => new PDFJSEngine());
  const { isLoaded, setDocumentState } = useViewerStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        await engine.load(DEFAULT_PDF);
        setDocumentState({
          isLoaded: true,
          pageCount: engine.getPageCount(),
          currentPage: engine.getCurrentPage(),
          zoom: engine.getZoom(),
          outline: await engine.getOutline()
        });
      } catch (err) {
        setError('Falha ao inicializar Engine Papyrus.');
      }
    };
    init();
    return () => engine.destroy();
  }, [engine]);

  if (!isLoaded && !error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-bold text-gray-500 tracking-widest uppercase font-mono">Papyrus Core Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden text-gray-900 font-sans">
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
