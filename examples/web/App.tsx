
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';
import { EPUBEngine } from '@papyrus-sdk/engine-epub';
import { TextEngine } from '@papyrus-sdk/engine-text';
import { useViewerStore, papyrusEvents } from '@papyrus-sdk/core';
import { PapyrusEventType, PapyrusConfig, PageTheme } from '@papyrus-sdk/types';
import { Topbar, SidebarLeft, SidebarRight, Viewer } from '@papyrus-sdk/ui-react';

const LOCAL_PDF_URL = new URL('./assets/tracemonkey-pldi-09.pdf', import.meta.url).toString();
const LOCAL_EPUB_URL = new URL('./assets/sample.epub', import.meta.url).toString();
const LOCAL_TEXT_URL = new URL('./assets/sample.txt', import.meta.url).toString();

const ACCENT_COLOR = '#2563eb';
const createInitialConfig = (isEmbedded: boolean, overrides?: Partial<PapyrusConfig>): PapyrusConfig => ({
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
  ],
  ...overrides,
});

type EngineKind = 'pdf' | 'epub' | 'text';
type UITheme = 'light' | 'dark';

type DemoMessage = {
  source?: string;
  action?: string;
  value?: unknown;
  payload?: Record<string, unknown> | null;
};

const usePapyrusDemo = (
  engineKind: EngineKind,
  setEngineKind: ((kind: EngineKind) => void) | null,
  initialConfig: PapyrusConfig
) => {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventLogEnabled, setEventLogEnabled] = useState(false);
  const storeInitializedRef = useRef(false);

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
        if (!setEngineKind) return;
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

  return { engine, isLoaded, loadError, setDocumentState };
};

const LoadingState: React.FC<{ error: string | null; className?: string }> = ({ error, className }) => (
  <div className={`${className ?? 'h-full'} flex flex-col items-center justify-center bg-[#1a1a1a] font-mono`} style={{ color: ACCENT_COLOR }}>
    <div className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mb-4" style={{ borderColor: ACCENT_COLOR }} />
    <span className="text-[10px] font-black tracking-[0.3em] uppercase animate-pulse">Initializing Papyrus SDK...</span>
    {error && (
      <div className="mt-3 text-[11px] text-red-300">{error}</div>
    )}
  </div>
);

const PapyrusViewer: React.FC<{
  engineKind: EngineKind;
  setEngineKind: (kind: EngineKind) => void;
  initialConfig: PapyrusConfig;
  syncState?: { uiTheme: UITheme; pageTheme: PageTheme; accentColor: string };
  topbarProps?: React.ComponentProps<typeof Topbar>;
  className?: string;
  loadingClassName?: string;
}> = ({ engineKind, setEngineKind, initialConfig, syncState, topbarProps, className, loadingClassName }) => {
  const { engine, isLoaded, loadError, setDocumentState } = usePapyrusDemo(
    engineKind,
    setEngineKind,
    initialConfig
  );

  useEffect(() => {
    if (!syncState) return;
    setDocumentState({
      uiTheme: syncState.uiTheme,
      pageTheme: syncState.pageTheme,
      accentColor: syncState.accentColor,
    });
  }, [syncState, setDocumentState]);

  if (!isLoaded) return <LoadingState error={loadError} className={loadingClassName} />;

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className ?? 'bg-gray-100'}`}>
      <Topbar engine={engine} {...topbarProps} />
      <div className="flex flex-1 overflow-hidden">
        <SidebarLeft engine={engine} />
        <Viewer engine={engine} />
        <SidebarRight engine={engine} />
      </div>
    </div>
  );
};

const RenderPage: React.FC = () => {
  const [engineKind, setEngineKind] = useState<EngineKind>('pdf');
  const isEmbedded = useMemo(
    () => typeof window !== 'undefined' && window.parent && window.parent !== window,
    []
  );
  const initialConfig = useMemo(() => createInitialConfig(isEmbedded), [isEmbedded]);

  return (
    <PapyrusViewer
      engineKind={engineKind}
      setEngineKind={setEngineKind}
      initialConfig={initialConfig}
      className="bg-gray-100 h-screen"
      loadingClassName="h-screen"
    />
  );
};

const ConfigPage: React.FC = () => {
  const [engineKind, setEngineKind] = useState<EngineKind>('pdf');
  const [uiTheme, setUiTheme] = useState<UITheme>('dark');
  const [pageTheme, setPageTheme] = useState<PageTheme>('sepia');
  const [accentColor, setAccentColor] = useState(ACCENT_COLOR);
  const [title, setTitle] = useState('Papyrus Demo');
  const [showBrand, setShowBrand] = useState(true);
  const [showUpload, setShowUpload] = useState(true);
  const [showUIToggle, setShowUIToggle] = useState(true);
  const [showPageThemeSelector, setShowPageThemeSelector] = useState(true);
  const [showSearch, setShowSearch] = useState(true);
  const [showSidebarLeftToggle, setShowSidebarLeftToggle] = useState(true);
  const [showPageControls, setShowPageControls] = useState(true);
  const [showZoomControls, setShowZoomControls] = useState(true);

  const initialConfigRef = useRef(
    createInitialConfig(false, {
      initialUITheme: uiTheme,
      initialPageTheme: pageTheme,
      initialAccentColor: accentColor,
    })
  );
  const initialConfig = initialConfigRef.current;

  const codeSample = useMemo(() => {
    const config = [
      `  initialUITheme: "${uiTheme}",`,
      `  initialPageTheme: "${pageTheme}",`,
      `  initialAccentColor: "${accentColor}",`,
    ].join('\n');

    const topbarProps = [
      title ? `  title: "${title}",` : null,
      `  showBrand: ${showBrand},`,
      `  showUpload: ${showUpload},`,
      `  showUIToggle: ${showUIToggle},`,
      `  showPageThemeSelector: ${showPageThemeSelector},`,
      `  showSearch: ${showSearch},`,
      `  showSidebarLeftToggle: ${showSidebarLeftToggle},`,
      `  showPageControls: ${showPageControls},`,
      `  showZoomControls: ${showZoomControls},`,
    ].filter(Boolean).join('\n');

    return `const config = {\n${config}\n};\n\n<Topbar\n  engine={engine}\n${topbarProps}\n/>`;
  }, [
    uiTheme,
    pageTheme,
    accentColor,
    title,
    showBrand,
    showUpload,
    showUIToggle,
    showPageThemeSelector,
    showSearch,
    showSidebarLeftToggle,
    showPageControls,
    showZoomControls,
  ]);

  return (
    <div className="h-screen w-screen bg-[#0b0f1a] text-white">
      <div className="h-full grid grid-cols-[360px_1fr] gap-0">
        <div className="p-6 border-r border-white/10 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm font-semibold tracking-widest uppercase text-white/60">Papyrus Config</div>
            <a href="/render" className="text-xs text-blue-300 hover:text-blue-200">Abrir /render</a>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Engine</label>
              <select
                className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                value={engineKind}
                onChange={(e) => setEngineKind(e.target.value as EngineKind)}
              >
                <option value="pdf">PDF</option>
                <option value="epub">EPUB</option>
                <option value="text">TXT</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Titulo</label>
              <input
                className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nome do documento"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">UI Theme</label>
                <select
                  className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                  value={uiTheme}
                  onChange={(e) => setUiTheme(e.target.value as UITheme)}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Page Theme</label>
                <select
                  className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                  value={pageTheme}
                  onChange={(e) => setPageTheme(e.target.value as PageTheme)}
                >
                  <option value="normal">Normal</option>
                  <option value="sepia">Sepia</option>
                  <option value="dark">Dark</option>
                  <option value="high-contrast">High contrast</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-2">Accent Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-10 rounded border border-white/10 bg-transparent"
                />
                <input
                  className="flex-1 bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-3">Topbar</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Brand', showBrand, setShowBrand],
                  ['Upload', showUpload, setShowUpload],
                  ['UI Toggle', showUIToggle, setShowUIToggle],
                  ['Page Theme', showPageThemeSelector, setShowPageThemeSelector],
                  ['Search', showSearch, setShowSearch],
                  ['Sidebar Toggle', showSidebarLeftToggle, setShowSidebarLeftToggle],
                  ['Page Controls', showPageControls, setShowPageControls],
                  ['Zoom Controls', showZoomControls, setShowZoomControls],
                ].map(([label, value, setter]) => (
                  <label key={label as string} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-2">
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)}
                    />
                    <span>{label as string}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs uppercase tracking-widest text-white/60 mb-3">Codigo</label>
              <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4 text-[11px] leading-relaxed font-mono text-white/80 overflow-auto max-h-[220px]">
                <pre className="whitespace-pre">{codeSample}</pre>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="text-xs uppercase tracking-widest text-white/50 mb-3">Preview</div>
          <div className="h-[calc(100vh-120px)] rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-[#0f172a]">
            <PapyrusViewer
              engineKind={engineKind}
              setEngineKind={setEngineKind}
              initialConfig={initialConfig}
              syncState={{ uiTheme, pageTheme, accentColor }}
              loadingClassName="h-full"
              topbarProps={{
                title,
                showBrand,
                showUpload,
                showUIToggle,
                showPageThemeSelector,
                showSearch,
                showSidebarLeftToggle,
                showPageControls,
                showZoomControls,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const view = useMemo(() => {
    if (typeof window === 'undefined') return 'config';
    const { pathname, hash, search } = window.location;
    if (pathname.startsWith('/render')) return 'render';
    if (hash.includes('render')) return 'render';
    const params = new URLSearchParams(search);
    if (params.get('view') === 'render') return 'render';
    return 'config';
  }, []);

  if (view === 'render') return <RenderPage />;
  return <ConfigPage />;
};
export default App;
