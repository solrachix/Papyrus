import React, { useEffect, useMemo, useRef, useState } from "react";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import PageRenderer from "./PageRenderer";

interface ViewerProps {
  engine: DocumentEngine;
  style?: React.CSSProperties;
}
const BASE_OVERSCAN = 6;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const WIDTH_SNAP_PX = 4;
const WIDTH_HYSTERESIS_PX = 6;

const Viewer: React.FC<ViewerProps> = ({ engine, style }) => {
  const {
    pageCount,
    currentPage,
    zoom,
    activeTool,
    uiTheme,
    scrollToPageSignal,
    setDocumentState,
    accentColor,
    annotationColor,
    setAnnotationColor,
    toolDockOpen,
  } = useViewerStore();
  const isDark = uiTheme === "dark";
  const viewerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const intersectionRatiosRef = useRef<Record<number, number>>({});
  const frameRef = useRef<number | null>(null);
  const jumpRef = useRef(false);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWidthRef = useRef<number | null>(null);
  const pinchRef = useRef<{
    active: boolean;
    startDistance: number;
    startZoom: number;
    pendingZoom: number | null;
    rafId: number | null;
  }>({
    active: false,
    startDistance: 0,
    startZoom: 1,
    pendingZoom: null,
    rafId: null,
  });
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [basePageSize, setBasePageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pageSizes, setPageSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const isCompact = availableWidth !== null && availableWidth < 820;
  const paddingY = isCompact ? "py-10" : "py-16";
  const toolDockPosition = isCompact ? "bottom-4" : "bottom-8";
  const colorPalette = [
    "#fbbf24",
    "#f97316",
    "#ef4444",
    "#22c55e",
    "#06b6d4",
    "#3b82f6",
    "#8b5cf6",
    "#111827",
  ];

  useEffect(() => {
    if (!colorPickerOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!colorPickerRef.current) return;
      if (!colorPickerRef.current.contains(event.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [colorPickerOpen]);

  useEffect(() => {
    if (!toolDockOpen && colorPickerOpen) setColorPickerOpen(false);
  }, [toolDockOpen, colorPickerOpen]);

  useEffect(
    () => () => {
      if (pinchRef.current.rafId != null) {
        cancelAnimationFrame(pinchRef.current.rafId);
      }
    },
    []
  );

  useEffect(() => {
    const viewerElement = viewerRef.current;
    if (!viewerElement) return;
    const measurementTarget = viewerElement.parentElement ?? viewerElement;
    let rafId: number | null = null;

    const normalizeWidth = (rawWidth: number) =>
      Math.max(0, Math.floor(rawWidth / WIDTH_SNAP_PX) * WIDTH_SNAP_PX);

    const updateWidth = () => {
      const rawWidth =
        measurementTarget.getBoundingClientRect?.().width ??
        measurementTarget.clientWidth ??
        measurementTarget.offsetWidth;
      const nextWidth = normalizeWidth(rawWidth);
      if (nextWidth <= 0) return;
      const previousWidth = lastWidthRef.current;
      if (
        previousWidth != null &&
        Math.abs(nextWidth - previousWidth) < WIDTH_HYSTERESIS_PX
      )
        return;
      lastWidthRef.current = nextWidth;
      setAvailableWidth(nextWidth);
    };

    const scheduleWidthUpdate = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateWidth();
      });
    };

    scheduleWidthUpdate();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleWidthUpdate);
      window.visualViewport?.addEventListener("resize", scheduleWidthUpdate);
      return () => {
        if (rafId != null) cancelAnimationFrame(rafId);
        window.removeEventListener("resize", scheduleWidthUpdate);
        window.visualViewport?.removeEventListener(
          "resize",
          scheduleWidthUpdate
        );
      };
    }

    const observer = new ResizeObserver(() => scheduleWidthUpdate());
    observer.observe(measurementTarget);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!pageCount) return;
    const loadBaseSize = async () => {
      try {
        const size = await engine.getPageDimensions(0);
        if (!active || !size.width || !size.height) return;
        setBasePageSize(size);
      } catch {
        // ignore
      }
    };
    loadBaseSize();
    return () => {
      active = false;
    };
  }, [engine, pageCount]);

  useEffect(() => {
    if (scrollToPageSignal == null) return;
    const root = viewerRef.current;
    const target = pageRefs.current[scrollToPageSignal];
    if (root) {
      setDocumentState({ currentPage: scrollToPageSignal + 1 });
      jumpRef.current = true;
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);

      const previousBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";

      let targetTop: number | null = null;
      if (target) {
        targetTop = target.offsetTop;
      } else if (basePageSize && availableWidth) {
        const fitScale = Math.min(
          1,
          Math.max(0, availableWidth - 48) / basePageSize.width
        );
        const estimatedPageHeight = basePageSize.height * fitScale * zoom + 64;
        targetTop = Math.max(0, estimatedPageHeight * scrollToPageSignal);
      } else if (pageCount > 1) {
        const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
        const ratio = scrollToPageSignal / Math.max(1, pageCount - 1);
        targetTop = Math.max(0, maxScroll * ratio);
      }

      if (targetTop != null) {
        root.scrollTop = Math.max(0, targetTop - 12);
      }

      requestAnimationFrame(() => {
        root.style.scrollBehavior = previousBehavior;
      });

      jumpTimerRef.current = setTimeout(() => {
        jumpRef.current = false;
      }, 250);
    }
    setDocumentState({ scrollToPageSignal: null });
  }, [
    scrollToPageSignal,
    setDocumentState,
    basePageSize,
    availableWidth,
    zoom,
    pageCount,
  ]);

  useEffect(() => {
    // Size cache must follow current zoom, otherwise virtual placeholders may jump.
    setPageSizes({});
  }, [zoom]);

  useEffect(() => {
    const root = viewerRef.current;
    if (!root) return;
    const flushCurrentPage = () => {
      if (jumpRef.current) return;
      const ratios = intersectionRatiosRef.current;
      const entries = Object.entries(ratios).filter(([, ratio]) => ratio > 0);
      if (!entries.length) return;
      const currentIndex = currentPage - 1;
      const currentRatio = ratios[currentIndex] ?? 0;
      const [bestIndexText, bestRatio] = entries.reduce((best, candidate) =>
        Number(candidate[1]) > Number(best[1]) ? candidate : best
      );
      const bestIndex = Number(bestIndexText);
      if (!Number.isFinite(bestIndex)) return;
      const bestPage = bestIndex + 1;
      // Hysteresis avoids page-number flicker when viewport is between two pages.
      const shouldSwitch =
        bestPage !== currentPage &&
        (currentRatio <= 0 ||
          bestRatio >= currentRatio + 0.1 ||
          bestRatio >= 0.75);
      if (shouldSwitch) setDocumentState({ currentPage: bestPage });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageIndex = parseInt(
            entry.target.getAttribute("data-page-index") || "0"
          );
          if (!Number.isFinite(pageIndex)) return;
          intersectionRatiosRef.current[pageIndex] = entry.isIntersecting
            ? entry.intersectionRatio
            : 0;
        });
        if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          flushCurrentPage();
        });
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );

    const pageElements = root.querySelectorAll(".page-container");
    pageElements.forEach((el) => observer.observe(el));
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      pageElements.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [pageCount, setDocumentState, currentPage]);

  const virtualOverscan = zoom > 1.35 ? 4 : BASE_OVERSCAN;
  const virtualAnchor = currentPage - 1;
  const virtualStart = Math.max(0, virtualAnchor - virtualOverscan);
  const virtualEnd = Math.min(pageCount - 1, virtualAnchor + virtualOverscan);
  const fallbackSize = useMemo(() => {
    if (basePageSize && availableWidth) {
      const fitScale = Math.min(
        1,
        Math.max(0, availableWidth - 48) / basePageSize.width
      );
      return {
        width: Math.round(basePageSize.width * fitScale * zoom),
        height: Math.round(basePageSize.height * fitScale * zoom),
      };
    }
    const base = availableWidth ? Math.max(680, availableWidth * 1.3) : 1100;
    return {
      width: Math.round((availableWidth ?? 860) - 48),
      height: Math.round(base * zoom),
    };
  }, [basePageSize, availableWidth, zoom]);
  const averagePageHeight = useMemo(() => {
    const heights = Object.values(pageSizes).map((size) => size.height);
    if (!heights.length)
      return availableWidth ? Math.max(680, availableWidth * 1.3) : 1100;
    return Math.round(heights.reduce((sum, h) => sum + h, 0) / heights.length);
  }, [pageSizes, availableWidth]);
  const pages = Array.from({ length: pageCount }).map((_, i) => i);
  const handlePageMeasured = (
    pageIndex: number,
    size: { width: number; height: number }
  ) => {
    setPageSizes((prev) => {
      const current = prev[pageIndex];
      if (
        current &&
        current.width === size.width &&
        current.height === size.height
      )
        return prev;
      return { ...prev, [pageIndex]: size };
    });
  };
  const tools = [
    { id: "select", name: "Select", icon: "M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" },
    {
      id: "highlight",
      name: "Highlight",
      icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    },
    {
      id: "underline",
      name: "Underline",
      icon: "M6 3v6a6 6 0 0012 0V3M4 21h16",
    },
    {
      id: "squiggly",
      name: "Squiggly",
      icon: "M3 17c2-4 4-4 6 0s4 4 6 0 4-4 6 0",
    },
    { id: "strikeout", name: "Strike", icon: "M4 12h16M8 6h8M8 18h8" },
    { id: "ink", name: "Freehand", icon: "M4 19c4-6 7-9 10-9 3 0 5 2 6 5" },
    {
      id: "comment",
      name: "Note",
      icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",
    },
  ];

  const getTouchDistance = (
    touchA: { clientX: number; clientY: number },
    touchB: { clientX: number; clientY: number }
  ) => {
    const dx = touchA.clientX - touchB.clientX;
    const dy = touchA.clientY - touchB.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const flushPinchZoom = () => {
    const nextZoom = pinchRef.current.pendingZoom;
    pinchRef.current.pendingZoom = null;
    pinchRef.current.rafId = null;
    if (nextZoom == null) return;
    engine.setZoom(nextZoom);
    setDocumentState({ zoom: nextZoom });
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) return;
    const touchA = event.touches[0];
    const touchB = event.touches[1];
    pinchRef.current.active = true;
    pinchRef.current.startDistance = getTouchDistance(touchA, touchB);
    pinchRef.current.startZoom = zoom;
    event.preventDefault();
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!pinchRef.current.active || event.touches.length < 2) return;
    const touchA = event.touches[0];
    const touchB = event.touches[1];
    const nextDistance = getTouchDistance(touchA, touchB);
    if (!pinchRef.current.startDistance) return;
    const scale = nextDistance / pinchRef.current.startDistance;
    const nextZoom = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, pinchRef.current.startZoom * scale)
    );
    pinchRef.current.pendingZoom = nextZoom;
    if (pinchRef.current.rafId == null) {
      pinchRef.current.rafId = requestAnimationFrame(flushPinchZoom);
    }
    event.preventDefault();
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) return;
    pinchRef.current.active = false;
    pinchRef.current.startDistance = 0;
    pinchRef.current.startZoom = zoom;
    if (
      pinchRef.current.pendingZoom != null &&
      pinchRef.current.rafId == null
    ) {
      engine.setZoom(pinchRef.current.pendingZoom);
      setDocumentState({ zoom: pinchRef.current.pendingZoom });
      pinchRef.current.pendingZoom = null;
    }
  };

  return (
    <div
      ref={viewerRef}
      data-papyrus-theme={uiTheme}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`papyrus-viewer papyrus-theme min-w-0 w-full flex-1 overflow-y-scroll overflow-x-hidden flex flex-col items-center ${paddingY} relative custom-scrollbar scroll-smooth ${
        isDark ? "bg-[#121212]" : "bg-[#e9ecef]"
      }`}
      style={style}
    >
      <div className="flex flex-col items-center gap-6 w-full min-w-0">
        {pages.map((idx) => (
          <div
            key={idx}
            ref={(element) => {
              pageRefs.current[idx] = element;
            }}
            data-page-index={idx}
            className="page-container"
          >
            {idx >= virtualStart && idx <= virtualEnd ? (
              <PageRenderer
                engine={engine}
                pageIndex={idx}
                availableWidth={availableWidth ?? undefined}
                onMeasuredSize={handlePageMeasured}
              />
            ) : (
              <div
                className={`inline-block mb-10 shadow-2xl border ${
                  isDark
                    ? "bg-[#0f0f0f] border-[#2b2b2b]"
                    : "bg-white border-gray-200"
                }`}
                style={{
                  width: pageSizes[idx]?.width ?? fallbackSize.width,
                  height:
                    pageSizes[idx]?.height ??
                    Math.max(fallbackSize.height, averagePageHeight),
                }}
              />
            )}
          </div>
        ))}
      </div>
      {toolDockOpen && (
        <div
          className={`papyrus-tool-dock sticky ${toolDockPosition} w-full flex justify-center pointer-events-none z-[70]`}
        >
          <div
            className={`pointer-events-auto shadow-2xl rounded-2xl p-2 flex items-center border z-[80] ${
              isDark
                ? "bg-[#2a2a2a]/90 border-[#3a3a3a] backdrop-blur-xl"
                : "bg-white/95 border-gray-100 backdrop-blur-md"
            }`}
          >
            {tools.map((tool) => (
              <button
                key={tool.id}
                title={tool.name}
                aria-label={tool.name}
                onClick={() => setDocumentState({ activeTool: tool.id as any })}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  activeTool === tool.id
                    ? "text-white shadow-lg"
                    : "text-gray-400"
                }`}
                style={
                  activeTool === tool.id
                    ? { backgroundColor: accentColor }
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
                    d={tool.icon}
                  />
                </svg>
              </button>
            ))}
            <div className="w-px h-7 mx-2 bg-white/10" />
            <div ref={colorPickerRef} className="relative">
              <button
                title="Cor do marcador"
                aria-label="Cor do marcador"
                onClick={() => setColorPickerOpen((prev) => !prev)}
                className="w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer relative"
                style={{ borderColor: annotationColor }}
              >
                <span
                  className="w-5 h-5 rounded-full"
                  style={{ backgroundColor: annotationColor }}
                />
              </button>
              {colorPickerOpen && (
                <div
                  className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 rounded-xl border p-3 shadow-2xl overflow-hidden ${
                    isDark
                      ? "bg-[#1f1f1f] border-[#333]"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {colorPalette.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setAnnotationColor(color);
                          setColorPickerOpen(false);
                        }}
                        className="w-7 h-7 rounded-full border transition-all"
                        style={{
                          backgroundColor: color,
                          borderColor:
                            color === annotationColor ? "#fff" : "transparent",
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-[10px] uppercase tracking-widest text-gray-400 shrink-0">
                      Hex
                    </span>
                    <input
                      type="text"
                      value={annotationColor.toUpperCase()}
                      onChange={(e) => {
                        const next = e.target.value.trim();
                        if (
                          next.startsWith("#") &&
                          (next.length === 4 || next.length === 7)
                        ) {
                          setAnnotationColor(next);
                        }
                      }}
                      className={`flex-1 min-w-0 w-full text-xs rounded-md px-2 py-1 border ${
                        isDark
                          ? "bg-[#2a2a2a] border-[#444] text-white"
                          : "bg-gray-100 border-gray-200 text-gray-700"
                      }`}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Viewer;
