import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine, PageTheme } from "@papyrus-sdk/types";

interface TopbarProps {
  engine: DocumentEngine;
  showBrand?: boolean;
  brand?: React.ReactNode;
  title?: React.ReactNode;
  showSidebarLeftToggle?: boolean;
  showPageControls?: boolean;
  showZoomControls?: boolean;
  showPageThemeSelector?: boolean;
  showUIToggle?: boolean;
  showUpload?: boolean;
  showSearch?: boolean;
}

const Topbar: React.FC<TopbarProps> = ({
  engine,
  showBrand = false,
  brand,
  title,
  showSidebarLeftToggle = true,
  showPageControls = true,
  showZoomControls = true,
  showPageThemeSelector = true,
  showUIToggle = true,
  showUpload = true,
  showSearch = true,
}) => {
  const {
    currentPage,
    pageCount,
    zoom,
    uiTheme,
    pageTheme,
    setDocumentState,
    accentColor,
    toolDockOpen,
    toggleSidebarLeft,
    toggleSidebarRight,
    triggerScrollToPage,
  } = useViewerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingZoomRef = useRef<number | null>(null);
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const [showPageThemes, setShowPageThemes] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const pageDigits = Math.max(2, String(pageCount || 1).length);
  const isDark = uiTheme === "dark";
  const canUseDOM = typeof document !== "undefined";
  const hasMobileMenu =
    showZoomControls || showPageThemeSelector || showUIToggle || showUpload;

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  useEffect(
    () => () => {
      if (zoomTimerRef.current) clearTimeout(zoomTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!hasMobileMenu) setShowMobileMenu(false);
  }, [hasMobileMenu]);

  useEffect(() => {
    if (!showMobileMenu || !canUseDOM) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowMobileMenu(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMobileMenu, canUseDOM]);

  const handleZoom = (delta: number) => {
    const baseZoom = pendingZoomRef.current ?? zoom;
    const nextZoom = Math.max(0.2, Math.min(5, baseZoom + delta));
    pendingZoomRef.current = nextZoom;
    if (zoomTimerRef.current) return;

    zoomTimerRef.current = setTimeout(() => {
      zoomTimerRef.current = null;
      const targetZoom = pendingZoomRef.current;
      pendingZoomRef.current = null;
      if (targetZoom == null) return;
      engine.setZoom(targetZoom);
      setDocumentState({ zoom: targetZoom });
    }, 80);
  };

  const handlePageChange = (page: number) => {
    if (pageCount <= 0) return;
    const nextPage = Math.max(1, Math.min(pageCount, isNaN(page) ? 1 : page));
    engine.goToPage(nextPage);
    setDocumentState({ currentPage: nextPage });
    triggerScrollToPage(nextPage - 1);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setDocumentState({ isLoaded: false });
    try {
      await engine.load(file);
      setDocumentState({
        isLoaded: true,
        pageCount: engine.getPageCount(),
        currentPage: 1,
        outline: await engine.getOutline(),
      });
    } catch (err) {
      console.error("Upload failed", err);
      setDocumentState({ isLoaded: true });
    }
  };

  const toggleToolDock = () => {
    setDocumentState({ toolDockOpen: !toolDockOpen });
  };

  const themes: { id: PageTheme; name: string; color: string }[] = [
    { id: "normal", name: "Original", color: "bg-white" },
    { id: "sepia", name: "Sépia", color: "bg-[#f4ecd8]" },
    { id: "dark", name: "Invertido", color: "bg-gray-800" },
    { id: "high-contrast", name: "Contraste", color: "bg-black" },
  ];

  const mobileMenuOverlay =
    canUseDOM && hasMobileMenu && showMobileMenu
      ? createPortal(
          <div
            className="sm:hidden fixed inset-0 z-[200] bg-black/45"
            onClick={(event) => {
              if (event.target === event.currentTarget)
                setShowMobileMenu(false);
            }}
          >
            <div
              className={`absolute inset-x-0 bottom-0 rounded-t-2xl border-x border-t p-4 pb-6 shadow-2xl ${
                isDark
                  ? "bg-[#181a1f] border-[#343a46] text-[#e6e9ef]"
                  : "bg-white border-gray-200 text-gray-900"
              }`}
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-400/60" />
              <div className="mb-4 flex items-center justify-between">
                <span
                  className={`text-sm font-semibold ${
                    isDark ? "text-gray-100" : "text-gray-800"
                  }`}
                >
                  Ações rápidas
                </span>
                <button
                  className={`p-2 rounded-md ${
                    isDark
                      ? "text-[#d9deea] hover:bg-white/10"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => setShowMobileMenu(false)}
                  aria-label="Fechar menu"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                {showZoomControls && (
                  <div
                    className={`rounded-xl border p-3 ${
                      isDark
                        ? "bg-[#20242d] border-[#3a4252] text-[#e6e9ef]"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div
                      className={`mb-2 text-xs ${
                        isDark ? "text-[#b7c0d2]" : "text-gray-600"
                      }`}
                    >
                      Zoom
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => handleZoom(-0.1)}
                        className="p-2 rounded-md border"
                        style={{ color: accentColor, borderColor: accentColor }}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M20 12H4"
                          />
                        </svg>
                      </button>
                      <span
                        className={`text-sm font-semibold ${
                          isDark ? "text-[#e6e9ef]" : "text-gray-800"
                        }`}
                      >
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        onClick={() => handleZoom(0.1)}
                        className="p-2 rounded-md border"
                        style={{ color: accentColor, borderColor: accentColor }}
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {showPageThemeSelector && (
                  <div
                    className={`rounded-xl border p-3 ${
                      isDark
                        ? "bg-[#20242d] border-[#3a4252] text-[#e6e9ef]"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div
                      className={`mb-2 text-xs ${
                        isDark ? "text-[#b7c0d2]" : "text-gray-600"
                      }`}
                    >
                      Tema da página
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {themes.map((theme) => (
                        <button
                          key={theme.id}
                          onClick={() => {
                            setDocumentState({ pageTheme: theme.id });
                          }}
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                            pageTheme === theme.id
                              ? "text-white"
                              : isDark
                              ? "text-[#dbe1ed] border-[#49556a]"
                              : "text-gray-700 border-gray-300"
                          }`}
                          style={
                            pageTheme === theme.id
                              ? {
                                  backgroundColor: accentColor,
                                  borderColor: accentColor,
                                }
                              : undefined
                          }
                        >
                          {theme.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {showUIToggle && (
                  <button
                    onClick={() => {
                      setDocumentState({ uiTheme: isDark ? "light" : "dark" });
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm font-medium flex items-center gap-2 ${
                      isDark
                        ? "bg-[#20242d] border-[#3a4252] text-[#e6e9ef]"
                        : "bg-gray-50 border-gray-200 text-gray-800"
                    }`}
                  >
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      {isDark ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 3v1m0 16v1m8-9h1M3 12H2m15.364 6.364l.707.707M5.93 5.93l-.707-.707m12.141 0l-.707.707M5.93 18.07l-.707.707M12 17a5 5 0 100-10 5 5 0 000 10z"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                        />
                      )}
                    </svg>
                    {isDark
                      ? "Mudar para tema claro"
                      : "Mudar para tema escuro"}
                  </button>
                )}

                {showUpload && (
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      fileInputRef.current?.click();
                    }}
                    className="w-full rounded-xl px-3 py-3 text-left text-sm font-semibold text-white flex items-center gap-2"
                    style={{ backgroundColor: accentColor }}
                  >
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                      />
                    </svg>
                    Upload de arquivo
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      data-papyrus-theme={uiTheme}
      className={`papyrus-topbar papyrus-theme relative h-14 border-b flex items-center px-3 sm:px-4 z-50 transition-colors duration-200 ${
        isDark
          ? "bg-[#1a1a1a] border-[#333] text-white"
          : "bg-white border-gray-200 text-gray-800"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 z-10">
        {showSidebarLeftToggle && (
          <button
            onClick={toggleSidebarLeft}
            className={`p-2 rounded-md ${
              isDark ? "hover:bg-white/10" : "hover:bg-gray-100"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}
        <button
          onClick={toggleToolDock}
          className={`p-2 rounded-md border transition-colors ${
            toolDockOpen
              ? isDark
                ? "border-[#335ea8] bg-[#1b2f55] text-[#8fb6ff]"
                : "border-blue-300 bg-blue-50 text-blue-700"
              : isDark
              ? "border-[#444] bg-[#2a2a2a] hover:bg-[#333]"
              : "border-gray-300 bg-white hover:bg-gray-100"
          }`}
          aria-label={toolDockOpen ? "Fechar ferramentas" : "Abrir ferramentas"}
          title={toolDockOpen ? "Fechar ferramentas" : "Abrir ferramentas"}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16.862 3.487a2.25 2.25 0 013.182 3.182L8.22 18.492a4.5 4.5 0 01-1.897 1.12l-2.692.898.898-2.692a4.5 4.5 0 011.12-1.897L16.862 3.487z"
            />
          </svg>
        </button>

        {showBrand &&
          (brand ?? (
            <span
              className="font-bold text-base tracking-tight"
              style={{ color: accentColor }}
            >
              Papyrus
              <span className={isDark ? "text-white" : "text-gray-900"}>
                Core
              </span>
            </span>
          ))}

        {title && (
          <span
            className={`text-sm font-semibold truncate min-w-0 max-w-[35vw] sm:max-w-[260px] ${
              isDark ? "text-gray-200" : "text-gray-700"
            }`}
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </span>
        )}
      </div>

      {(showPageControls || showZoomControls) && (
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
          {showPageControls && (
            <div
              className={`papyrus-control flex items-center rounded-lg p-1 space-x-1 border ${
                isDark
                  ? "bg-[#2a2a2a] border-[#444]"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                className="p-1.5 rounded transition-all hover:brightness-110"
                style={{ color: accentColor }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <input
                type="text"
                className="papyrus-input text-center bg-transparent focus:outline-none font-bold text-sm shrink-0"
                style={{ width: `${pageDigits + 1.75}ch` }}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && handlePageChange(parseInt(pageInput))
                }
                onBlur={() => handlePageChange(parseInt(pageInput))}
              />
              <span className="opacity-40 px-1">/</span>
              <span className="opacity-80 text-sm">
                {pageCount > 0 ? pageCount : "—"}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                className="p-1.5 rounded transition-all hover:brightness-110"
                style={{ color: accentColor }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}

          {showZoomControls && (
            <div
              className={`papyrus-control hidden sm:flex items-center rounded-lg p-1 border ${
                isDark
                  ? "bg-[#2a2a2a] border-[#444]"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <button
                onClick={() => handleZoom(-0.1)}
                className="p-1.5 rounded hover:brightness-110"
                style={{ color: accentColor }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 12H4"
                  />
                </svg>
              </button>
              <span className="px-3 text-xs font-bold min-w-[50px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => handleZoom(0.1)}
                className="p-1.5 rounded hover:brightness-110"
                style={{ color: accentColor }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-3 z-10">
        {showPageThemeSelector && (
          <div className="relative hidden sm:block">
            <button
              onClick={() => setShowPageThemes(!showPageThemes)}
              className={`papyrus-control flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${
                isDark
                  ? "bg-[#2a2a2a] border-[#444]"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full border ${
                  themes.find((t) => t.id === pageTheme)?.color
                }`}
              />
              <span>TEMA</span>
            </button>
            {showPageThemes && (
              <div
                className={`papyrus-popover absolute top-full right-0 mt-2 w-48 rounded-lg shadow-xl border p-2 z-[60] ${
                  isDark
                    ? "bg-[#2a2a2a] border-[#444]"
                    : "bg-white border-gray-200"
                }`}
              >
                {themes.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => {
                      setDocumentState({ pageTheme: theme.id });
                      setShowPageThemes(false);
                    }}
                    className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm ${
                      pageTheme === theme.id
                        ? "text-white"
                        : isDark
                        ? "hover:bg-white/10 text-gray-300"
                        : "hover:bg-gray-50 text-gray-700"
                    }`}
                    style={
                      pageTheme === theme.id
                        ? { backgroundColor: accentColor }
                        : undefined
                    }
                  >
                    <div
                      className={`w-3 h-3 rounded-full border ${theme.color}`}
                    />
                    <span>{theme.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showUIToggle && (
          <button
            onClick={() =>
              setDocumentState({ uiTheme: isDark ? "light" : "dark" })
            }
            className={`hidden sm:inline-flex p-2 rounded-full ${
              isDark
                ? "bg-yellow-500/10 text-yellow-500"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {isDark ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        )}

        {showUpload && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="hidden sm:inline-flex px-4 py-1.5 text-white rounded-md text-sm font-bold shadow-md active:scale-95"
            style={{ backgroundColor: accentColor }}
          >
            UPLOAD
          </button>
        )}

        {showSearch && (
          <button
            onClick={() => toggleSidebarRight("search")}
            className={`inline-flex p-2 rounded-md ${
              isDark ? "hover:bg-white/10" : "hover:bg-gray-100"
            }`}
            aria-label="Abrir busca"
            title="Buscar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </button>
        )}

        {hasMobileMenu && (
          <button
            onClick={() => setShowMobileMenu(true)}
            className={`sm:hidden p-2 rounded-md border ${
              isDark
                ? "border-[#444] bg-[#2a2a2a] hover:bg-[#333]"
                : "border-gray-300 bg-white hover:bg-gray-100"
            }`}
            aria-label="Abrir menu"
            title="Mais opções"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h.01M12 12h.01M19 12h.01"
              />
            </svg>
          </button>
        )}

        {showUpload && (
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pdf,.epub,.txt"
            onChange={handleFileUpload}
          />
        )}
      </div>
      {mobileMenuOverlay}
    </div>
  );
};

export default Topbar;
