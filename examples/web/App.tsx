import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PDFJSEngine } from "@papyrus-sdk/engine-pdfjs";
import {
  RustDocumentEngine,
  createBundledWasmRustRuntimeFactory,
} from "@papyrus-sdk/engine-rust";
import { EPUBEngine } from "@papyrus-sdk/engine-epub";
import { TextEngine } from "@papyrus-sdk/engine-text";
import { useViewerStore, papyrusEvents } from "@papyrus-sdk/core";
import {
  DocumentEngine,
  PapyrusEventType,
  PapyrusConfig,
  PageTheme,
} from "@papyrus-sdk/types";
import {
  SidebarLeft,
  SidebarRight,
  Topbar,
  Viewer,
} from "@papyrus-sdk/ui-react";

const LOCAL_PDF_URL = new URL(
  "./assets/tracemonkey-pldi-09.pdf",
  import.meta.url
).toString();
const REMOTE_PDF_URL =
  "https://raw.githubusercontent.com/pdf-association/pdf20examples/master/pdf20-utf8-test.pdf";
const LOCAL_EPUB_URL = new URL(
  "./assets/sample.epub",
  import.meta.url
).toString();
const LOCAL_TEXT_URL = new URL(
  "./assets/sample.txt",
  import.meta.url
).toString();

const ACCENT_COLOR = "#2563eb";
const createInitialConfig = (
  isEmbedded: boolean,
  overrides?: Partial<PapyrusConfig>
): PapyrusConfig => ({
  initialUITheme: "dark",
  initialPageTheme: "sepia",
  initialPage: 1,
  initialZoom: 1.0,
  initialAccentColor: ACCENT_COLOR,
  sidebarLeftOpen: !isEmbedded,
  sidebarRightOpen: false,
  initialAnnotations: [
    {
      id: "mock-1",
      pageIndex: 3,
      type: "text",
      color: "#3b82f6",
      content: "Esta nota foi carregada via configuracao inicial!",
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 },
      createdAt: Date.now(),
    },
  ],
  ...overrides,
});

type EngineKind = "pdf" | "rust" | "epub" | "text" | "cbz" | "cbr";
type UITheme = "light" | "dark";

const parseEngineKindFromLocation = (): EngineKind => {
  if (typeof window === "undefined") return "pdf";
  const params = new URLSearchParams(window.location.search);
  const fromQuery = (params.get("engine") || "").toLowerCase();
  if (
    fromQuery === "pdf" ||
    fromQuery === "rust" ||
    fromQuery === "epub" ||
    fromQuery === "text" ||
    fromQuery === "cbz" ||
    fromQuery === "cbr"
  ) {
    return fromQuery;
  }
  return "pdf";
};

type DemoMessage = {
  source?: string;
  action?: string;
  value?: unknown;
  payload?: Record<string, unknown> | null;
};

const usePapyrusDemo = (
  engineKind: EngineKind,
  setEngineKind: ((kind: EngineKind) => void) | null,
  initialConfig: PapyrusConfig,
  options?: { useRemotePdf?: boolean; remotePdfUrl?: string }
) => {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eventLogEnabled, setEventLogEnabled] = useState(false);
  const [comicEngine, setComicEngine] = useState<DocumentEngine | null>(null);
  const storeInitializedRef = useRef(false);
  const { useRemotePdf, remotePdfUrl } = options ?? {};

  useEffect(() => {
    if (engineKind !== "cbz" && engineKind !== "cbr") {
      setComicEngine(null);
      return;
    }

    let active = true;
    setComicEngine(null);

    const loadComicEngine = async () => {
      try {
        if (engineKind === "cbz") {
          const { CBZEngine } = await import("@papyrus-sdk/engine-cbz");
          if (active) setComicEngine(new CBZEngine());
        } else {
          const { createDemoCbrEngine } = await import("./cbrDemo");
          if (active) setComicEngine(createDemoCbrEngine());
        }
      } catch (error) {
        console.error("Comic engine import failed", error);
        if (active) setLoadError("Falha ao carregar a engine de quadrinhos.");
      }
    };

    loadComicEngine();
    return () => {
      active = false;
    };
  }, [engineKind]);

  const engine = useMemo(() => {
    if (engineKind === "cbz" || engineKind === "cbr") return comicEngine;
    if (engineKind === "epub") return new EPUBEngine();
    if (engineKind === "text") return new TextEngine();
    if (engineKind === "rust") {
      return new RustDocumentEngine({
        pdfEngine: new PDFJSEngine(),
        runtimeFactory: createBundledWasmRustRuntimeFactory(),
      });
    }
    return new PDFJSEngine();
  }, [comicEngine, engineKind]);

  const demoSource = useMemo(() => {
    if (engineKind === "epub") return LOCAL_EPUB_URL;
    if (engineKind === "text") return LOCAL_TEXT_URL;
    if (engineKind === "cbz" || engineKind === "cbr") return null;
    if (useRemotePdf) return remotePdfUrl || REMOTE_PDF_URL;
    return LOCAL_PDF_URL;
  }, [engineKind, useRemotePdf, remotePdfUrl]);

  const { isLoaded, setDocumentState, initializeStore, triggerScrollToPage } =
    useViewerStore();

  useEffect(() => {
    const sendEvent = (type: PapyrusEventType, payload: unknown) => {
      if (!eventLogEnabled) return;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: "papyrus-demo",
            type: "event",
            eventType: type,
            payload,
          },
          "*"
        );
      }
    };

    const unsubDoc = papyrusEvents.on(
      PapyrusEventType.DOCUMENT_LOADED,
      (payload) => {
        console.log(`[SDK] Documento pronto: ${payload.pageCount} pgs`);
        sendEvent(PapyrusEventType.DOCUMENT_LOADED, payload);
      }
    );

    const unsubSelection = papyrusEvents.on(
      PapyrusEventType.TEXT_SELECTED,
      (payload) => {
        console.log(
          `[SDK] Texto selecionado na pag ${payload.pageIndex + 1}: "${
            payload.text
          }"`
        );
        sendEvent(PapyrusEventType.TEXT_SELECTED, payload);
      }
    );

    return () => {
      unsubDoc();
      unsubSelection();
    };
  }, [eventLogEnabled]);

  const handleMessage = useCallback(
    (event: MessageEvent<DemoMessage>) => {
      const data = event.data;
      if (!data || data.source !== "papyrus-docs") return;
      if (import.meta.env.MODE !== "docs" && window.parent === window) return;

      switch (data.action) {
        case "set-ui-theme": {
          if (data.value === "light" || data.value === "dark") {
            setDocumentState({ uiTheme: data.value });
          }
          break;
        }
        case "set-page-theme": {
          if (
            data.value === "normal" ||
            data.value === "sepia" ||
            data.value === "dark" ||
            data.value === "high-contrast"
          ) {
            setDocumentState({ pageTheme: data.value });
          }
          break;
        }
        case "set-locale": {
          if (data.value === "en" || data.value === "pt-BR") {
            setDocumentState({ locale: data.value });
          }
          break;
        }
        case "set-engine": {
          if (!setEngineKind) return;
          if (
            data.value === "pdf" ||
            data.value === "epub" ||
            data.value === "text" ||
            data.value === "cbz" ||
            data.value === "cbr"
          ) {
            setEngineKind(data.value as EngineKind);
          }
          break;
        }
        case "set-event-log": {
          setEventLogEnabled(Boolean(data.value));
          break;
        }
        case "set-zoom": {
          if (!engine) return;
          const nextZoom =
            typeof data.value === "number" ? data.value : Number(data.value);
          if (Number.isFinite(nextZoom)) {
            engine.setZoom(nextZoom);
            setDocumentState({ zoom: nextZoom });
          }
          break;
        }
        case "go-to-page": {
          if (!engine) return;
          const nextPage =
            typeof data.value === "number" ? data.value : Number(data.value);
          if (Number.isFinite(nextPage)) {
            const page = Math.max(
              1,
              Math.min(engine.getPageCount(), Math.floor(nextPage))
            );
            engine.goToPage(page);
            setDocumentState({ currentPage: page });
            triggerScrollToPage(page - 1);
          }
          break;
        }
        default:
          break;
      }
    },
    [engine, setDocumentState, setEngineKind, triggerScrollToPage]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
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
        setDocumentState({
          isLoaded: false,
          pageCount: 0,
          outline: [],
          currentPage: 1,
        });
        setLoadError(null);

        if (!engine) return;

        const source =
          engineKind === "cbz"
            ? await (await import("./comicDemo")).createDemoCbz()
            : demoSource;

        if (!source) {
          setDocumentState({
            isLoaded: true,
            pageCount: 0,
            outline: [],
            currentPage: 1,
          });
          return;
        }

        await engine.load(source);

        if (!active) return;

        if (initialConfig.initialZoom)
          engine.setZoom(initialConfig.initialZoom);
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
        console.error("Papyrus Engine Init Failed", err);
        setLoadError("Falha ao carregar o documento padrão.");
      }
    };

    init();

    return () => {
      active = false;
      engine?.destroy();
    };
  }, [
    demoSource,
    engineKind,
    engine,
    initializeStore,
    setDocumentState,
    triggerScrollToPage,
    initialConfig,
  ]);

  return { engine, isLoaded, loadError, setDocumentState };
};

const LoadingState: React.FC<{ error: string | null; className?: string }> = ({
  error,
  className,
}) => (
  <div
    className={`${
      className ?? "h-full"
    } flex flex-col items-center justify-center bg-[#1a1a1a] font-mono`}
    style={{ color: ACCENT_COLOR }}
  >
    <div
      className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin mb-4"
      style={{ borderColor: ACCENT_COLOR }}
    />
    <span className="text-[10px] font-black tracking-[0.3em] uppercase animate-pulse">
      Initializing Papyrus SDK...
    </span>
    {error && <div className="mt-3 text-[11px] text-red-300">{error}</div>}
  </div>
);

const PapyrusViewer: React.FC<{
  engineKind: EngineKind;
  setEngineKind: (kind: EngineKind) => void;
  useRemotePdf?: boolean;
  remotePdfUrl?: string;
  initialConfig: PapyrusConfig;
  syncState?: { uiTheme: UITheme; pageTheme: PageTheme; accentColor: string };
  themeVars?: React.CSSProperties;
  topbarProps?: { title?: string } & Record<string, unknown>;
  className?: string;
  loadingClassName?: string;
}> = ({
  engineKind,
  setEngineKind,
  useRemotePdf,
  remotePdfUrl,
  initialConfig,
  syncState,
  themeVars,
  topbarProps,
  className,
  loadingClassName,
}) => {
  const { engine, isLoaded, loadError, setDocumentState } = usePapyrusDemo(
    engineKind,
    setEngineKind,
    initialConfig,
    { useRemotePdf, remotePdfUrl }
  );

  useEffect(() => {
    if (!syncState) return;
    setDocumentState({
      uiTheme: syncState.uiTheme,
      pageTheme: syncState.pageTheme,
      accentColor: syncState.accentColor,
    });
  }, [syncState, setDocumentState]);

  if (!isLoaded || !engine)
    return <LoadingState error={loadError} className={loadingClassName} />;

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${
        className ?? "bg-gray-100"
      }`}
    >
      <Topbar engine={engine} style={themeVars} {...topbarProps} />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <SidebarLeft engine={engine} style={themeVars} />
        <Viewer engine={engine} style={themeVars} />
        <SidebarRight engine={engine} style={themeVars} />
      </div>
    </div>
  );
};

const RenderPage: React.FC = () => {
  const [engineKind, setEngineKind] = useState<EngineKind>(
    parseEngineKindFromLocation
  );
  const [useRemotePdf, setUseRemotePdf] = useState(false);
  const [remotePdfUrl, setRemotePdfUrl] = useState(REMOTE_PDF_URL);
  const isEmbedded = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.parent &&
      window.parent !== window,
    []
  );
  const initialConfig = useMemo(
    () => createInitialConfig(isEmbedded),
    [isEmbedded]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("engine", engineKind);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [engineKind]);

  return (
    <PapyrusViewer
      engineKind={engineKind}
      setEngineKind={setEngineKind}
      useRemotePdf={useRemotePdf}
      remotePdfUrl={remotePdfUrl}
      initialConfig={initialConfig}
      topbarProps={{ title: "Papyrus Demo" }}
      className="bg-gray-100 h-[100dvh]"
      loadingClassName="h-[100dvh]"
    />
  );
};

const ConfigPage: React.FC = () => {
  const [engineKind, setEngineKind] = useState<EngineKind>("pdf");
  const [uiTheme, setUiTheme] = useState<UITheme>("dark");
  const [pageTheme, setPageTheme] = useState<PageTheme>("sepia");
  const [accentColor, setAccentColor] = useState(ACCENT_COLOR);
  const [title, setTitle] = useState("Papyrus Demo");
  const [useRemotePdf, setUseRemotePdf] = useState(false);
  const [remotePdfUrl, setRemotePdfUrl] = useState(REMOTE_PDF_URL);
  const [openSection, setOpenSection] = useState("engine");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localObjectUrlRef = useRef<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBrand, setShowBrand] = useState(true);
  const [showUpload, setShowUpload] = useState(true);
  const [showUIToggle, setShowUIToggle] = useState(true);
  const [showPageThemeSelector, setShowPageThemeSelector] = useState(true);
  const [showSearch, setShowSearch] = useState(true);
  const [showSidebarLeftToggle, setShowSidebarLeftToggle] = useState(true);
  const [showPageControls, setShowPageControls] = useState(true);
  const [showZoomControls, setShowZoomControls] = useState(true);
  const [themeSurface, setThemeSurface] = useState("#111827");
  const [themeSurface2, setThemeSurface2] = useState("#1f2937");
  const [themeBorder, setThemeBorder] = useState("#273244");
  const [themeText, setThemeText] = useState("#e2e8f0");
  const [themeTextMuted, setThemeTextMuted] = useState("#94a3b8");
  const [themeCanvas, setThemeCanvas] = useState("#0b1220");

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
    ].join("\n");

    const remotePdfLine =
      (engineKind === "pdf" || engineKind === "rust") && useRemotePdf
        ? `\nawait engine.load("${remotePdfUrl}");`
        : "";

    const topbarProps = [
      title ? `  title="${title}"` : null,
      `  showBrand={${showBrand}}`,
      `  showUpload={${showUpload}}`,
      `  showUIToggle={${showUIToggle}}`,
      `  showPageThemeSelector={${showPageThemeSelector}}`,
      `  showSearch={${showSearch}}`,
      `  showSidebarLeftToggle={${showSidebarLeftToggle}}`,
      `  showPageControls={${showPageControls}}`,
      `  showZoomControls={${showZoomControls}}`,
    ]
      .filter(Boolean)
      .join("\n");

    const themeVars = [
      `  '--papyrus-surface': '${themeSurface}',`,
      `  '--papyrus-surface-2': '${themeSurface2}',`,
      `  '--papyrus-border': '${themeBorder}',`,
      `  '--papyrus-text': '${themeText}',`,
      `  '--papyrus-text-muted': '${themeTextMuted}',`,
      `  '--papyrus-canvas': '${themeCanvas}',`,
    ].join("\n");

    return `const config = {\n${config}\n};\n${remotePdfLine}\n\nconst themeVars = {\n${themeVars}\n};\n\n<div style={themeVars}>\n  <Topbar\n    engine={engine}\n${topbarProps}\n  />\n</div>`;
  }, [
    uiTheme,
    pageTheme,
    accentColor,
    title,
    engineKind,
    useRemotePdf,
    remotePdfUrl,
    showBrand,
    showUpload,
    showUIToggle,
    showPageThemeSelector,
    showSearch,
    showSidebarLeftToggle,
    showPageControls,
    showZoomControls,
    themeSurface,
    themeSurface2,
    themeBorder,
    themeText,
    themeTextMuted,
    themeCanvas,
  ]);

  const themeVarsStyle = useMemo(
    () =>
      ({
        "--papyrus-surface": themeSurface,
        "--papyrus-surface-2": themeSurface2,
        "--papyrus-border": themeBorder,
        "--papyrus-text": themeText,
        "--papyrus-text-muted": themeTextMuted,
        "--papyrus-canvas": themeCanvas,
      } as React.CSSProperties),
    [
      themeSurface,
      themeSurface2,
      themeBorder,
      themeText,
      themeTextMuted,
      themeCanvas,
    ]
  );

  useEffect(() => {
    return () => {
      if (localObjectUrlRef.current) {
        URL.revokeObjectURL(localObjectUrlRef.current);
        localObjectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const handleLocalPdf = (file?: File | null) => {
    if (!file) return;
    if (localObjectUrlRef.current) {
      URL.revokeObjectURL(localObjectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    localObjectUrlRef.current = url;
    setEngineKind("pdf");
    setUseRemotePdf(true);
    setRemotePdfUrl(url);
  };

  const Section: React.FC<{
    id: string;
    title: string;
    children: React.ReactNode;
  }> = ({ id, title, children }) => {
    const isOpen = openSection === id;
    return (
      <div className="rounded-xl border border-white/10 bg-white/5">
        <button
          type="button"
          onClick={() => setOpenSection(isOpen ? "" : id)}
          className="w-full flex items-center justify-between px-4 py-3 text-left text-xs uppercase tracking-widest text-white/70"
        >
          <span>{title}</span>
          <span
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
        <div
          className={`grid transition-all duration-300 ease-out ${
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="px-4 pb-4 space-y-3">{children}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen w-screen bg-[#0b0f1a] text-white">
      <div className="h-full grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-0">
        <div className="min-w-0 p-4 sm:p-6 border-r border-white/10 overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="text-sm font-semibold tracking-widest uppercase text-white/60">
              Papyrus Config
            </div>
            <a
              href="/render"
              className="text-xs text-blue-300 hover:text-blue-200"
            >
              Abrir /render
            </a>
          </div>

          <div className="space-y-4">
            <Section id="engine" title="Engine">
              <select
                className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                value={engineKind}
                onChange={(e) => setEngineKind(e.target.value as EngineKind)}
              >
                <option value="pdf">PDF</option>
                <option value="rust">PDF + Rust (experimental)</option>
                <option value="epub">EPUB</option>
                <option value="text">TXT</option>
                <option value="cbz">CBZ (Comic ZIP)</option>
                <option value="cbr">CBR (RAR via upload)</option>
              </select>
              {(engineKind === "cbz" || engineKind === "cbr") && (
                <div className="text-[11px] text-white/50">
                  {engineKind === "cbz"
                    ? "O demo gera um CBZ pequeno no navegador."
                    : "Selecione CBR e use Upload para abrir um arquivo RAR."}
                </div>
              )}
            </Section>

            {(engineKind === "pdf" || engineKind === "rust") && (
              <Section id="pdf" title="PDF remoto">
                <label className="flex items-center gap-2 text-xs bg-white/5 border border-white/10 rounded-md px-2 py-2">
                  <input
                    type="checkbox"
                    checked={useRemotePdf}
                    onChange={(e) => setUseRemotePdf(e.target.checked)}
                  />
                  <span>Usar URL remota</span>
                </label>
                {useRemotePdf && (
                  <input
                    className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                    value={remotePdfUrl}
                    onChange={(e) => setRemotePdfUrl(e.target.value)}
                    placeholder="https://..."
                  />
                )}
                {!useRemotePdf && (
                  <div className="text-[11px] text-white/50">
                    Usando PDF local de{" "}
                    <span className="font-mono">/assets</span>.
                  </div>
                )}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full px-3 py-2 rounded-md text-xs font-semibold bg-white/10 border border-white/10 hover:bg-white/20"
                  >
                    Upload PDF local
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => handleLocalPdf(e.target.files?.[0])}
                  />
                </div>
              </Section>
            )}

            <Section id="title" title="Titulo">
              <input
                className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nome do documento"
              />
            </Section>

            <Section id="ui" title="UI">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-widest text-white/60 mb-2">
                    UI Theme
                  </label>
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
                  <label className="block text-[11px] uppercase tracking-widest text-white/60 mb-2">
                    Page Theme
                  </label>
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
                <label className="block text-[11px] uppercase tracking-widest text-white/60 mb-2">
                  Accent Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-10 w-10 rounded border border-white/10 bg-transparent"
                  />
                  <input
                    className="min-w-0 flex-1 bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </div>
              </div>
              <div className="pt-2">
                <label className="block text-[11px] uppercase tracking-widest text-white/60 mb-2">
                  Theme Vars
                </label>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {[
                    ["Surface", themeSurface, setThemeSurface],
                    ["Surface 2", themeSurface2, setThemeSurface2],
                    ["Border", themeBorder, setThemeBorder],
                    ["Text", themeText, setThemeText],
                    ["Text muted", themeTextMuted, setThemeTextMuted],
                    ["Canvas", themeCanvas, setThemeCanvas],
                  ].map(([label, value, setter]) => (
                    <label
                      key={label as string}
                      className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-2"
                    >
                      <span className="w-20 text-[11px] text-white/60">
                        {label as string}
                      </span>
                      <input
                        type="color"
                        value={value as string}
                        onChange={(e) =>
                          (
                            setter as React.Dispatch<
                              React.SetStateAction<string>
                            >
                          )(e.target.value)
                        }
                        className="h-8 w-8 rounded border border-white/10 bg-transparent"
                      />
                      <input
                        className="min-w-0 flex-1 bg-white/10 border border-white/10 rounded-md px-2 py-1 text-[11px]"
                        value={value as string}
                        onChange={(e) =>
                          (
                            setter as React.Dispatch<
                              React.SetStateAction<string>
                            >
                          )(e.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            </Section>

            <Section id="topbar" title="Topbar">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ["Brand", showBrand, setShowBrand],
                  ["Upload", showUpload, setShowUpload],
                  ["UI Toggle", showUIToggle, setShowUIToggle],
                  [
                    "Page Theme",
                    showPageThemeSelector,
                    setShowPageThemeSelector,
                  ],
                  ["Search", showSearch, setShowSearch],
                  [
                    "Sidebar Toggle",
                    showSidebarLeftToggle,
                    setShowSidebarLeftToggle,
                  ],
                  ["Page Controls", showPageControls, setShowPageControls],
                  ["Zoom Controls", showZoomControls, setShowZoomControls],
                ].map(([label, value, setter]) => (
                  <label
                    key={label as string}
                    className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-md px-2 py-2"
                  >
                    <input
                      type="checkbox"
                      checked={value as boolean}
                      onChange={(e) =>
                        (
                          setter as React.Dispatch<
                            React.SetStateAction<boolean>
                          >
                        )(e.target.checked)
                      }
                    />
                    <span>{label as string}</span>
                  </label>
                ))}
              </div>
            </Section>

            <Section id="code" title="Codigo">
              <div className="rounded-xl border border-white/10 bg-[#0f172a] p-4 text-[11px] leading-relaxed font-mono text-white/80 overflow-auto max-h-[220px]">
                <pre className="whitespace-pre">{codeSample}</pre>
              </div>
            </Section>
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-6 lg:border-l border-white/10">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/50 mb-3">
            <span>Preview</span>
            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="text-[10px] px-3 py-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
            >
              Expandir
            </button>
          </div>
          <div
            className="min-w-0 h-[60vh] lg:h-[calc(100vh-120px)] rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-[#0f172a]"
            style={themeVarsStyle}
          >
            <PapyrusViewer
              engineKind={engineKind}
              setEngineKind={setEngineKind}
              useRemotePdf={useRemotePdf}
              remotePdfUrl={remotePdfUrl}
              initialConfig={initialConfig}
              syncState={{ uiTheme, pageTheme, accentColor }}
              themeVars={themeVarsStyle}
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
      {isFullscreen && (
        <div className="fixed inset-0 z-[80] bg-[#0b0f1a]">
          <div className="absolute top-4 right-4 z-[90] flex gap-2">
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className="text-[11px] px-3 py-2 rounded-full border border-white/10 bg-white/10 hover:bg-white/20"
            >
              Fechar
            </button>
          </div>
          <div
            className="absolute inset-4 rounded-2xl border border-white/10 overflow-hidden shadow-2xl bg-[#0f172a]"
            style={themeVarsStyle}
          >
            <PapyrusViewer
              engineKind={engineKind}
              setEngineKind={setEngineKind}
              useRemotePdf={useRemotePdf}
              remotePdfUrl={remotePdfUrl}
              initialConfig={initialConfig}
              syncState={{ uiTheme, pageTheme, accentColor }}
              themeVars={themeVarsStyle}
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
      )}
    </div>
  );
};

const App: React.FC = () => {
  const view = useMemo(() => {
    if (typeof window === "undefined") return "config";
    const { pathname, hash, search } = window.location;
    if (pathname.startsWith("/render")) return "render";
    if (hash.includes("render")) return "render";
    const params = new URLSearchParams(search);
    if (params.get("view") === "render") return "render";
    return "config";
  }, []);

  if (view === "render") return <RenderPage />;
  return <ConfigPage />;
};
export default App;
