import React, { useEffect, useRef, useState } from "react";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine, OutlineItem } from "@papyrus-sdk/types";

interface SidebarLeftProps {
  engine: DocumentEngine;
  style?: React.CSSProperties;
}

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "").trim();
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const isEpubDebugEnabled = () => {
  try {
    return Boolean((globalThis as any)?.__PAPYRUS_EPUB_DEBUG__);
  } catch {
    return false;
  }
};

const Thumbnail: React.FC<{
  engine: DocumentEngine;
  pageIndex: number;
  active: boolean;
  isDark: boolean;
  accentColor: string;
  onClick: () => void;
}> = ({ engine, pageIndex, active, isDark, accentColor, onClick }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const htmlRef = useRef<HTMLDivElement>(null);
  const accentSoft = withAlpha(accentColor, 0.12);
  const renderTargetType =
    (engine.getRenderTargetType?.() as string | undefined) ?? "canvas";
  const isElementRender = renderTargetType === "element";
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const target = wrapperRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const root = target.closest(".custom-scrollbar");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { root: root ?? null, rootMargin: "200px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible || isElementRender) return;
    const target =
      renderTargetType === "element" ? htmlRef.current : canvasRef.current;
    if (target) {
      engine.renderPage(pageIndex, target, 0.15).catch((err) => {
        console.error("[Papyrus] Thumbnail render failed:", err);
      });
    }
  }, [engine, pageIndex, renderTargetType, isVisible, isElementRender]);

  return (
    <div
      ref={wrapperRef}
      onClick={onClick}
      className={`p-3 cursor-pointer transition-all rounded-lg border-2 ${
        active ? "shadow-sm" : "border-transparent"
      }`}
      style={
        active
          ? { borderColor: accentColor, backgroundColor: accentSoft }
          : undefined
      }
    >
      <div className="flex flex-col items-center">
        <div
          className={`shadow-lg rounded overflow-hidden mb-2 border ${
            isDark ? "border-[#333]" : "border-gray-200"
          }`}
        >
          <div
            className={`w-[90px] h-[120px] items-center justify-center text-[10px] font-black tracking-wider ${
              isElementRender ? "flex" : "hidden"
            } ${
              isDark
                ? "bg-[#1f1f1f] text-gray-300"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            CAP
          </div>
          <canvas
            ref={canvasRef}
            className="max-w-full h-auto bg-white"
            style={{
              display: isElementRender ? "none" : "block",
            }}
          />
          <div
            ref={htmlRef}
            className="bg-white"
            style={{
              width: 90,
              height: 120,
              display: "none",
              overflow: "hidden",
            }}
          />
        </div>
        <span
          className={`text-[11px] font-bold ${
            active ? "" : isDark ? "text-gray-500" : "text-gray-400"
          }`}
          style={active ? { color: accentColor } : undefined}
        >
          {pageIndex + 1}
        </span>
      </div>
    </div>
  );
};

const OutlineNode: React.FC<{
  item: OutlineItem;
  engine: DocumentEngine;
  isDark: boolean;
  accentColor: string;
  depth?: number;
}> = ({ item, engine, isDark, accentColor, depth = 0 }) => {
  const { triggerScrollToPage, outlineSearchQuery, setDocumentState } =
    useViewerStore();
  const [expanded, setExpanded] = useState(true);
  const accentSoft = withAlpha(accentColor, 0.2);
  const renderTargetType = engine.getRenderTargetType?.() ?? "canvas";
  const isSingleViewportMode =
    renderTargetType === "element" || renderTargetType === "webview";

  const matchesSearch =
    outlineSearchQuery === "" ||
    item.title.toLowerCase().includes(outlineSearchQuery.toLowerCase());
  const hasMatchingChildren = item.children?.some((child) =>
    child.title.toLowerCase().includes(outlineSearchQuery.toLowerCase())
  );

  if (!matchesSearch && !hasMatchingChildren && outlineSearchQuery !== "")
    return null;

  const handleClick = () => {
    void (async () => {
      if (item.pageIndex < 0 && !item.dest) return;

      let targetPageIndex = item.pageIndex;
      let navigatedByDestination = false;
      const destinationEngine = engine as DocumentEngine & {
        goToDestination?: (dest: any) => Promise<number | null>;
      };

      if (
        isSingleViewportMode &&
        item.dest &&
        typeof destinationEngine.goToDestination === "function"
      ) {
        try {
          if (isEpubDebugEnabled()) {
            console.log("[EPUBUI] toc-click", {
              title: item.title,
              dest: item.dest,
              pageIndex: item.pageIndex,
            });
          }
          const resolved = await destinationEngine.goToDestination(item.dest);
          if (isEpubDebugEnabled()) {
            console.log("[EPUBUI] toc-resolved", {
              title: item.title,
              resolved,
            });
          }
          if (resolved != null) targetPageIndex = resolved;
          navigatedByDestination = true;
        } catch {
          // Fallback to generic page navigation below.
        }
      }

      if (item.dest && (!navigatedByDestination || targetPageIndex < 0)) {
        try {
          const resolved = await engine.getPageIndex(item.dest);
          if (resolved != null) targetPageIndex = resolved;
        } catch {
          // Keep fallback index when destination resolution fails.
        }
      }

      if (navigatedByDestination && isSingleViewportMode) {
        const page =
          targetPageIndex >= 0 ? targetPageIndex + 1 : engine.getCurrentPage();
        setDocumentState({ currentPage: page, scrollToPageSignal: null });
        return;
      }

      if (targetPageIndex < 0) return;
      const page = targetPageIndex + 1;

      engine.goToPage(page);
      if (isSingleViewportMode) {
        setDocumentState({ currentPage: page, scrollToPageSignal: null });
      } else {
        triggerScrollToPage(targetPageIndex);
      }
    })();
  };

  return (
    <div className="flex flex-col">
      <div
        className={`flex items-center py-1.5 px-3 rounded-md transition-colors group ${
          item.pageIndex >= 0 ? "cursor-pointer" : "cursor-default"
        } ${isDark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
      >
        {item.children && item.children.length > 0 ? (
          <button
            className={`mr-1 text-gray-400 transition-transform p-1`}
            style={{
              color: accentColor,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : (
          <div className="w-5" />
        )}
        <span
          className={`text-[13px] leading-tight font-medium truncate ${
            isDark ? "text-gray-200" : "text-gray-700"
          }`}
          style={
            matchesSearch && outlineSearchQuery
              ? { backgroundColor: accentSoft, color: accentColor }
              : undefined
          }
        >
          {item.title}
        </span>
      </div>
      {expanded && item.children && item.children.length > 0 && (
        <div className="flex flex-col">
          {item.children.map((child, i) => (
            <OutlineNode
              key={i}
              item={child}
              engine={engine}
              isDark={isDark}
              accentColor={accentColor}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const SidebarLeft: React.FC<SidebarLeftProps> = ({ engine, style }) => {
  const {
    pageCount,
    currentPage,
    setDocumentState,
    sidebarLeftOpen,
    uiTheme,
    triggerScrollToPage,
    sidebarLeftTab,
    setSidebarLeftTab,
    outline,
    outlineSearchQuery,
    setOutlineSearch,
    accentColor,
  } = useViewerStore();
  const isDark = uiTheme === "dark";
  const renderTargetType = engine.getRenderTargetType?.() ?? "canvas";
  const prefersSummaryByDefault =
    renderTargetType === "element" || renderTargetType === "webview";
  const autoSummaryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!prefersSummaryByDefault) return;
    if (sidebarLeftTab !== "thumbnails") return;
    if (pageCount <= 0) return;
    const docKey = `${pageCount}:${outline.length}`;
    if (autoSummaryKeyRef.current === docKey) return;
    autoSummaryKeyRef.current = docKey;
    setSidebarLeftTab("summary");
  }, [
    prefersSummaryByDefault,
    sidebarLeftTab,
    pageCount,
    outline.length,
    setSidebarLeftTab,
  ]);

  if (!sidebarLeftOpen) return null;

  return (
    <div
      data-papyrus-theme={uiTheme}
      className={`papyrus-sidebar-left papyrus-theme absolute left-0 top-0 bottom-0 z-[120] w-[85vw] max-w-72 border-r flex flex-col h-full overflow-hidden transition-colors duration-200 ${
        isDark
          ? "bg-[#2a2a2a] border-[#3a3a3a]"
          : "bg-[#fcfcfc] border-gray-200"
      }`}
      style={style}
    >
      <div
        className={`p-4 border-b flex flex-col space-y-4 ${
          isDark ? "border-[#3a3a3a]" : "border-gray-100"
        }`}
      >
        <div className="flex items-center justify-between">
          <h3
            className={`text-sm font-bold uppercase tracking-widest ${
              isDark ? "text-gray-100" : "text-gray-800"
            }`}
          >
            {sidebarLeftTab === "thumbnails" ? "Thumbnails" : "Sumário"}
          </h3>
          <button
            onClick={() => setDocumentState({ sidebarLeftOpen: false })}
            className="text-gray-400 hover:text-gray-600"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setSidebarLeftTab("thumbnails")}
            className={`p-2 rounded-md ${
              sidebarLeftTab === "thumbnails"
                ? isDark
                  ? "bg-white/10 text-white"
                  : "bg-white shadow-sm border border-gray-200"
                : "text-gray-400"
            }`}
            style={
              sidebarLeftTab === "thumbnails" && !isDark
                ? { color: accentColor }
                : undefined
            }
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
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2 2V6z"
              />
            </svg>
          </button>
          <button
            onClick={() => setSidebarLeftTab("summary")}
            className={`p-2 rounded-md ${
              sidebarLeftTab === "summary"
                ? isDark
                  ? "bg-white/10 text-white"
                  : "bg-white shadow-sm border border-gray-200"
                : "text-gray-400"
            }`}
            style={
              sidebarLeftTab === "summary" && !isDark
                ? { color: accentColor }
                : undefined
            }
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
                d="M4 6h16M4 12h16M4 18h7"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {sidebarLeftTab === "thumbnails" ? (
          <div className="space-y-1">
            {Array.from({ length: pageCount }).map((_, idx) => (
              <Thumbnail
                key={idx}
                engine={engine}
                pageIndex={idx}
                isDark={isDark}
                accentColor={accentColor}
                active={currentPage === idx + 1}
                onClick={() => {
                  const page = idx + 1;
                  engine.goToPage(page);
                  if (prefersSummaryByDefault) {
                    setDocumentState({
                      currentPage: page,
                      scrollToPageSignal: null,
                    });
                  } else {
                    triggerScrollToPage(idx);
                  }
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col space-y-0.5">
            {outline.map((item, i) => (
              <OutlineNode
                key={i}
                item={item}
                engine={engine}
                isDark={isDark}
                accentColor={accentColor}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default SidebarLeft;
