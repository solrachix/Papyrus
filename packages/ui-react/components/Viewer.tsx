import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveRenderOverscan, useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import PageRenderer from "./PageRenderer";
import { isSingleViewportMode as getIsSingleViewportMode } from "./renderMode";
import { resolveViewerVirtualWindows } from "./viewerVirtualization";
import {
  resolveWebPinchAnchorScrollLeft,
  resolveWebPinchAnchorScrollTop,
  resolveWebPinchPreviewZoom,
} from "./pinchZoom";
import { getWebPerfCollector } from "../perf/webPerf";

interface ViewerProps {
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
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const WIDTH_SNAP_PX = 4;
const WIDTH_HYSTERESIS_PX = 6;
const HEIGHT_SNAP_PX = 4;
const HEIGHT_HYSTERESIS_PX = 6;
const MOBILE_HEADER_HIDE_DELTA_PX = 28;
const MOBILE_HEADER_SHOW_DELTA_PX = 16;
const MOBILE_HEADER_TOP_RESET_PX = 12;
const MOBILE_LANDSCAPE_MAX_HEIGHT_PX = 500;

const Viewer: React.FC<ViewerProps> = ({ engine, style }) => {
  const viewerState = useViewerStore();
  const {
    pageCount,
    currentPage,
    zoom,
    activeTool,
    uiTheme,
    scrollToPageSignal,
    setDocumentState,
    triggerScrollToPage,
    accentColor,
    annotationColor,
    setAnnotationColor,
    toolDockOpen,
  } = viewerState;
  const mobileTopbarVisible =
    (
      viewerState as typeof viewerState & {
        mobileTopbarVisible?: boolean;
      }
  ).mobileTopbarVisible ?? true;
  const isDark = uiTheme === "dark";
  const isSingleViewportMode = getIsSingleViewportMode(engine);
  const viewerRef = useRef<HTMLDivElement>(null);
  const pinchSurfaceRef = useRef<HTMLDivElement>(null);
  const webPerf = useMemo(() => getWebPerfCollector(), []);
  const singleNavInFlightRef = useRef(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const intersectionRatiosRef = useRef<Record<number, number>>({});
  const frameRef = useRef<number | null>(null);
  const jumpRef = useRef(false);
  const jumpTargetPageRef = useRef<number | null>(null);
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWidthRef = useRef<number | null>(null);
  const lastHeightRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const scrollDownAccumulatorRef = useRef(0);
  const scrollUpAccumulatorRef = useRef(0);
  const previousCurrentPageRef = useRef(currentPage);
  const mobileTopbarVisibleRef = useRef(mobileTopbarVisible);
  const pinchRef = useRef<{
    active: boolean;
    startDistance: number;
    startZoom: number;
    pendingZoom: number | null;
    pendingCommitZoom: number | null;
    pendingReadyPageIndexes: Set<number> | null;
    focalViewportX: number;
    focalViewportY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>({
    active: false,
    startDistance: 0,
    startZoom: 1,
    pendingZoom: null,
    pendingCommitZoom: null,
    pendingReadyPageIndexes: null,
    focalViewportX: 0,
    focalViewportY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [viewerBounds, setViewerBounds] = useState<{
    left: number;
    width: number;
    top: number;
    height: number;
  } | null>(null);
  const [basePageSize, setBasePageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [pageSizes, setPageSizes] = useState<
    Record<number, { width: number; height: number }>
  >({});
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const isLandscape =
    availableWidth !== null &&
    availableHeight !== null &&
    availableWidth > availableHeight;
  const isLandscapeShort =
    isLandscape &&
    availableHeight !== null &&
    availableHeight <= MOBILE_LANDSCAPE_MAX_HEIGHT_PX;
  const isCompact =
    availableWidth !== null && (availableWidth < 820 || isLandscapeShort);
  const isMobileViewport =
    availableWidth !== null && (availableWidth < 640 || isLandscapeShort);
  const paddingY =
    isSingleViewportMode && isMobileViewport
      ? "py-0"
      : isCompact
      ? "py-10"
      : "py-16";
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
  const destinationNavEngine = engine as DocumentEngine & {
    goToAdjacentDestination?: (delta: number) => Promise<number | null>;
    getDestinationNavigationState?: () => {
      hasPrev: boolean;
      hasNext: boolean;
    };
  };
  const canUseDestinationNavigation =
    isSingleViewportMode &&
    typeof destinationNavEngine.goToAdjacentDestination === "function";
  const destinationNavigationState =
    isSingleViewportMode &&
    typeof destinationNavEngine.getDestinationNavigationState === "function"
      ? destinationNavEngine.getDestinationNavigationState()
      : null;
  const canGoPrev = destinationNavigationState?.hasPrev ?? currentPage > 1;
  const canGoNext =
    destinationNavigationState?.hasNext ?? currentPage < pageCount;
  const viewerOverflowClass = isSingleViewportMode
    ? "overflow-auto"
    : "overflow-y-scroll overflow-x-auto";

  const navigateBy = (delta: number) => {
    if (pageCount <= 0) return;
    if (canUseDestinationNavigation) {
      if (singleNavInFlightRef.current) return;
      singleNavInFlightRef.current = true;
      void (async () => {
        try {
          const resolved = await destinationNavEngine.goToAdjacentDestination!(
            delta
          );
          if (resolved == null) return;
          setDocumentState({
            currentPage: resolved + 1,
            scrollToPageSignal: null,
          });
        } finally {
          singleNavInFlightRef.current = false;
        }
      })();
      return;
    }

    const enginePage = Number(engine.getCurrentPage?.());
    const normalizedEnginePage =
      Number.isFinite(enginePage) && enginePage >= 1
        ? Math.floor(enginePage)
        : null;
    const basePage =
      normalizedEnginePage != null &&
      Math.abs(normalizedEnginePage - currentPage) <= 1
        ? normalizedEnginePage
        : currentPage;
    const clampedPage = Math.max(1, Math.min(pageCount, basePage + delta));
    if (clampedPage === basePage) return;
    engine.goToPage(clampedPage);
    if (isSingleViewportMode) {
      setDocumentState({ currentPage: clampedPage, scrollToPageSignal: null });
      return;
    }
    triggerScrollToPage(clampedPage - 1);
  };

  const setMobileTopbarVisibility = (visible: boolean) => {
    if (mobileTopbarVisibleRef.current === visible) return;
    mobileTopbarVisibleRef.current = visible;
    (setDocumentState as (state: Record<string, unknown>) => void)({
      mobileTopbarVisible: visible,
    });
  };

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

  useEffect(() => {
    mobileTopbarVisibleRef.current = mobileTopbarVisible;
  }, [mobileTopbarVisible]);

  useEffect(() => {
    webPerf.startFrameSampling();
    return () => webPerf.stopFrameSampling();
  }, [webPerf]);

  useEffect(() => {
    const root = viewerRef.current;
    if (!root) return;
    let scrolling = false;
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (!scrolling) {
        scrolling = true;
        webPerf.event("scroll.start", { scrollTop: root.scrollTop }, undefined, "viewer");
        webPerf.mark("scroll.start");
      }
      if (endTimer) clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        scrolling = false;
        webPerf.event("scroll.end", { scrollTop: root.scrollTop }, undefined, "viewer");
        webPerf.mark("scroll.end");
        webPerf.measure("scroll.duration", "scroll.start", "scroll.end");
      }, 100);
    };
    root.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", handleScroll);
      if (endTimer) clearTimeout(endTimer);
    };
  }, [webPerf]);

  useEffect(() => {
    const pendingCommitZoom = pinchRef.current.pendingCommitZoom;
    if (
      pinchRef.current.active ||
      pendingCommitZoom == null ||
      Math.abs(zoom - pendingCommitZoom) >= 0.001
    ) {
      return;
    }
    if (
      pinchRef.current.pendingReadyPageIndexes &&
      pinchRef.current.pendingReadyPageIndexes.size > 0
    ) {
      return;
    }
    if (pinchSurfaceRef.current) {
      pinchSurfaceRef.current.style.transform = "";
      pinchSurfaceRef.current.style.transformOrigin = "";
    }
    pinchRef.current.pendingCommitZoom = null;
  }, [zoom]);

  useEffect(() => {
    const viewerElement = viewerRef.current;
    if (!viewerElement) return;
    const measurementTarget = viewerElement.parentElement ?? viewerElement;
    let rafId: number | null = null;

    const normalizeWidth = (rawWidth: number) =>
      Math.max(0, Math.floor(rawWidth / WIDTH_SNAP_PX) * WIDTH_SNAP_PX);
    const normalizeHeight = (rawHeight: number) =>
      Math.max(0, Math.floor(rawHeight / HEIGHT_SNAP_PX) * HEIGHT_SNAP_PX);

    const updateSize = () => {
      const rawWidth =
        measurementTarget.getBoundingClientRect?.().width ??
        measurementTarget.clientWidth ??
        measurementTarget.offsetWidth;
      const rawHeight =
        measurementTarget.getBoundingClientRect?.().height ??
        measurementTarget.clientHeight ??
        measurementTarget.offsetHeight;
      const nextWidth = normalizeWidth(rawWidth);
      const nextHeight = normalizeHeight(rawHeight);
      if (nextWidth <= 0 || nextHeight <= 0) return;
      const previousWidth = lastWidthRef.current;
      const previousHeight = lastHeightRef.current;
      const widthChanged =
        previousWidth == null ||
        Math.abs(nextWidth - previousWidth) >= WIDTH_HYSTERESIS_PX;
      const heightChanged =
        previousHeight == null ||
        Math.abs(nextHeight - previousHeight) >= HEIGHT_HYSTERESIS_PX;
      if (!widthChanged && !heightChanged) return;
      if (widthChanged) {
        lastWidthRef.current = nextWidth;
        setAvailableWidth(nextWidth);
      }
      if (heightChanged) {
        lastHeightRef.current = nextHeight;
        setAvailableHeight(nextHeight);
      }
    };

    const scheduleWidthUpdate = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateSize();
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
    if (!isSingleViewportMode) return;
    const viewerElement = viewerRef.current;
    if (!viewerElement) return;

    let rafId: number | null = null;
    const updateBounds = () => {
      const rect = viewerElement.getBoundingClientRect();
      setViewerBounds({
        left: rect.left,
        width: rect.width,
        top: rect.top,
        height: rect.height,
      });
    };
    const scheduleUpdate = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateBounds();
      });
    };

    updateBounds();
    viewerElement.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => scheduleUpdate());
      observer.observe(viewerElement);
    }

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      viewerElement.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      observer?.disconnect();
    };
  }, [isSingleViewportMode]);

  useEffect(() => {
    const root = viewerRef.current;
    if (!root) return;

    if (isSingleViewportMode || !isMobileViewport) {
      lastScrollTopRef.current = root.scrollTop;
      scrollDownAccumulatorRef.current = 0;
      scrollUpAccumulatorRef.current = 0;
      setMobileTopbarVisibility(true);
      return;
    }

    lastScrollTopRef.current = root.scrollTop;
    scrollDownAccumulatorRef.current = 0;
    scrollUpAccumulatorRef.current = 0;

    const handleScroll = () => {
      const nextScrollTop = root.scrollTop;
      const delta = nextScrollTop - lastScrollTopRef.current;
      lastScrollTopRef.current = nextScrollTop;

      if (Math.abs(delta) < 1) return;

      if (nextScrollTop <= MOBILE_HEADER_TOP_RESET_PX) {
        scrollDownAccumulatorRef.current = 0;
        scrollUpAccumulatorRef.current = 0;
        setMobileTopbarVisibility(true);
        return;
      }

      if (delta > 0) {
        scrollDownAccumulatorRef.current += delta;
        scrollUpAccumulatorRef.current = 0;
      } else {
        scrollUpAccumulatorRef.current += -delta;
        scrollDownAccumulatorRef.current = 0;
      }

      if (
        scrollDownAccumulatorRef.current >= MOBILE_HEADER_HIDE_DELTA_PX &&
        mobileTopbarVisibleRef.current
      ) {
        scrollDownAccumulatorRef.current = 0;
        scrollUpAccumulatorRef.current = 0;
        setMobileTopbarVisibility(false);
        return;
      }

      if (
        scrollUpAccumulatorRef.current >= MOBILE_HEADER_SHOW_DELTA_PX &&
        !mobileTopbarVisibleRef.current
      ) {
        scrollDownAccumulatorRef.current = 0;
        scrollUpAccumulatorRef.current = 0;
        setMobileTopbarVisibility(true);
      }
    };

    root.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", handleScroll);
    };
  }, [isSingleViewportMode, isMobileViewport, setDocumentState]);

  useEffect(() => {
    const previousPage = previousCurrentPageRef.current;
    previousCurrentPageRef.current = currentPage;

    if (!isMobileViewport) return;

    if (currentPage < previousPage && !mobileTopbarVisibleRef.current) {
      scrollDownAccumulatorRef.current = 0;
      scrollUpAccumulatorRef.current = 0;
      setMobileTopbarVisibility(true);
    }
  }, [currentPage, isMobileViewport, setDocumentState]);

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
    const targetPageIndex = Math.max(
      0,
      Math.min(Math.max(pageCount - 1, 0), scrollToPageSignal)
    );
    jumpTargetPageRef.current = targetPageIndex;
    webPerf.event(
      "jump.start",
      { fromPage: currentPage - 1, toPage: targetPageIndex },
      undefined,
      "viewer"
    );
    webPerf.mark("jump.start");
    if (isSingleViewportMode) {
      const root = viewerRef.current;
      if (root) root.scrollTop = 0;
      setDocumentState({
        currentPage: targetPageIndex + 1,
        scrollToPageSignal: null,
      });
      return;
    }

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
    isSingleViewportMode,
    setDocumentState,
    basePageSize,
    availableWidth,
    zoom,
    pageCount,
    currentPage,
    webPerf,
  ]);

  useEffect(() => {
    if (!isSingleViewportMode) return;
    const root = viewerRef.current;
    if (!root) return;
    // Chapter/section navigation should always start from the top viewport.
    root.scrollTop = 0;
  }, [isSingleViewportMode, currentPage]);

  useEffect(() => {
    // Size cache must follow current zoom, otherwise virtual placeholders may jump.
    setPageSizes({});
  }, [zoom]);

  useEffect(() => {
    if (pageCount <= 1) return;
    const handleKeyNavigation = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        const isEditable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable ||
          target.getAttribute("contenteditable") === "true";
        if (isEditable) return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (!canGoPrev) return;
        navigateBy(-1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (!canGoNext) return;
        navigateBy(1);
      }
    };

    window.addEventListener("keydown", handleKeyNavigation);
    return () => window.removeEventListener("keydown", handleKeyNavigation);
  }, [
    currentPage,
    pageCount,
    triggerScrollToPage,
    engine,
    canGoPrev,
    canGoNext,
  ]);

  useEffect(() => {
    if (isSingleViewportMode) return;
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
      if (shouldSwitch) engine.goToPage(bestPage);
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
  }, [
    pageCount,
    setDocumentState,
    currentPage,
    isSingleViewportMode,
    engine,
  ]);

  const safeCurrentPageIndex = Math.max(
    0,
    Math.min(Math.max(pageCount - 1, 0), currentPage - 1)
  );
  const virtualAnchor = safeCurrentPageIndex;
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
  const virtualOverscan = resolveRenderOverscan({
    zoom,
    estimatedPagePixels: fallbackSize.width * fallbackSize.height,
    viewportHeight: viewerRef.current?.clientHeight ?? availableHeight ?? 900,
    devicePixelRatio:
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    buffersPerPage: 2,
  });
  const { render: renderPageWindow, wrappers: wrapperPageWindow } =
    resolveViewerVirtualWindows({
      pageCount,
      anchorIndex: virtualAnchor,
      renderOverscan: virtualOverscan,
      isSingleViewportMode,
    });
  const pages = Array.from(
    { length: wrapperPageWindow.count },
    (_, index) => wrapperPageWindow.start + index
  );
  const virtualItemHeight = Math.max(
    fallbackSize.height,
    averagePageHeight
  ) + 64;
  const viewerStyle = useMemo<React.CSSProperties>(
    () =>
      isSingleViewportMode
        ? {
            ...(style ?? {}),
            overflow: "auto",
            overflowY: "hidden",
            overflowX: "auto",
            overscrollBehavior: "none",
          }
        : style ?? {},
    [isSingleViewportMode, style]
  );
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

  useEffect(() => {
    webPerf.recordViewerWindow(viewerRef.current);
  }, [
    webPerf,
    pageCount,
    renderPageWindow.start,
    renderPageWindow.end,
    wrapperPageWindow.start,
    wrapperPageWindow.end,
  ]);

  const handlePinchRenderReady = useCallback(
    (pageIndex: number, renderedZoom: number) => {
      if (jumpTargetPageRef.current === pageIndex) {
        webPerf.event("jump.end", { pageIndex }, undefined, "viewer");
        webPerf.mark("jump.end");
        webPerf.measure("jump.duration", "jump.start", "jump.end");
        jumpTargetPageRef.current = null;
      }
      const pendingZoom = pinchRef.current.pendingCommitZoom;
      const pendingPages = pinchRef.current.pendingReadyPageIndexes;
      if (
        pendingZoom == null ||
        Math.abs(renderedZoom - pendingZoom) >= 0.001 ||
        !pendingPages
      ) {
        return;
      }
      pendingPages.delete(pageIndex);
      if (pendingPages.size === 0 && pinchSurfaceRef.current) {
        webPerf.mark("surface.ready");
        webPerf.measure(
          "zoom.commitToSurfaceReady",
          "zoom.commit",
          "surface.ready"
        );
        webPerf.event(
          "surface.ready",
          { pageIndex, renderedZoom },
          undefined,
          "pinch"
        );
        pinchSurfaceRef.current.style.transform = "";
        pinchSurfaceRef.current.style.transformOrigin = "";
        pinchRef.current.pendingCommitZoom = null;
        pinchRef.current.pendingReadyPageIndexes = null;
      }
    },
    [webPerf]
  );
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

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) return;
    const touchA = event.touches[0];
    const touchB = event.touches[1];
    pinchRef.current.active = true;
    pinchRef.current.startDistance = getTouchDistance(touchA, touchB);
    pinchRef.current.startZoom = zoom;
    pinchRef.current.pendingZoom = zoom;
    pinchRef.current.pendingCommitZoom = null;
    pinchRef.current.startScrollLeft = viewerRef.current?.scrollLeft ?? 0;
    pinchRef.current.startScrollTop = viewerRef.current?.scrollTop ?? 0;
    const viewerRect = viewerRef.current?.getBoundingClientRect();
    pinchRef.current.focalViewportX =
      (touchA.clientX + touchB.clientX) / 2 - (viewerRect?.left ?? 0);
    pinchRef.current.focalViewportY =
      (touchA.clientY + touchB.clientY) / 2 - (viewerRect?.top ?? 0);
    if (pinchSurfaceRef.current) {
      pinchSurfaceRef.current.style.transformOrigin = `${pinchRef.current.focalViewportX}px ${pinchRef.current.focalViewportY}px`;
      pinchSurfaceRef.current.style.transform = "scale(1)";
    }
    webPerf.event("pinch.start", { zoom }, undefined, "pinch");
    webPerf.mark("pinch.start");
    event.preventDefault();
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!pinchRef.current.active || event.touches.length < 2) return;
    const touchA = event.touches[0];
    const touchB = event.touches[1];
    const nextDistance = getTouchDistance(touchA, touchB);
    if (!pinchRef.current.startDistance) return;
    const scale = nextDistance / pinchRef.current.startDistance;
    const nextZoom = resolveWebPinchPreviewZoom({
      startZoom: pinchRef.current.startZoom,
      scaleFactor: scale,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
    pinchRef.current.pendingZoom = nextZoom;
    const viewerRect = viewerRef.current?.getBoundingClientRect();
    pinchRef.current.focalViewportX =
      (touchA.clientX + touchB.clientX) / 2 - (viewerRect?.left ?? 0);
    pinchRef.current.focalViewportY =
      (touchA.clientY + touchB.clientY) / 2 - (viewerRect?.top ?? 0);
    if (pinchSurfaceRef.current) {
      pinchSurfaceRef.current.style.transformOrigin = `${pinchRef.current.focalViewportX}px ${pinchRef.current.focalViewportY}px`;
      pinchSurfaceRef.current.style.transform = `scale(${nextZoom / Math.max(
        pinchRef.current.startZoom,
        0.0001
      )})`;
    }
    event.preventDefault();
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) return;
    const wasActive = pinchRef.current.active;
    pinchRef.current.active = false;
    pinchRef.current.startDistance = 0;
    const nextZoom = pinchRef.current.pendingZoom;
    pinchRef.current.pendingZoom = null;
    if (wasActive && nextZoom != null && Math.abs(nextZoom - zoom) >= 0.001) {
      const startZoom = pinchRef.current.startZoom;
      const startScrollLeft = pinchRef.current.startScrollLeft;
      const startScrollTop = pinchRef.current.startScrollTop;
      const focalViewportX = pinchRef.current.focalViewportX;
      const focalViewportY = pinchRef.current.focalViewportY;
      pinchRef.current.pendingCommitZoom = nextZoom;
      pinchRef.current.pendingReadyPageIndexes = new Set([safeCurrentPageIndex]);
      webPerf.event("zoom.commit", { fromZoom: zoom, toZoom: nextZoom }, undefined, "pinch");
      webPerf.mark("zoom.commit");
      engine.setZoom(nextZoom);
      setDocumentState({ zoom: nextZoom });
      requestAnimationFrame(() => {
        if (!viewerRef.current) return;
        viewerRef.current.scrollLeft = resolveWebPinchAnchorScrollLeft({
          startScrollLeft,
          focalViewportX,
          startZoom,
          finalZoom: nextZoom,
          maxScrollLeft:
            viewerRef.current.scrollWidth - viewerRef.current.clientWidth,
        });
        viewerRef.current.scrollTop = resolveWebPinchAnchorScrollTop({
          startScrollTop,
          focalViewportY,
          startZoom,
          finalZoom: nextZoom,
          maxScrollTop: viewerRef.current.scrollHeight - viewerRef.current.clientHeight,
        });
      });
    } else {
      if (wasActive) webPerf.event("pinch.cancel", { zoom }, undefined, "pinch");
      pinchRef.current.pendingCommitZoom = null;
      pinchRef.current.pendingReadyPageIndexes = null;
      if (pinchSurfaceRef.current) {
        pinchSurfaceRef.current.style.transform = "";
        pinchSurfaceRef.current.style.transformOrigin = "";
      }
    }
    pinchRef.current.startZoom = zoom;
  };

  const handleTouchCancel = (event: React.TouchEvent<HTMLDivElement>) => {
    if (pinchRef.current.active) {
      webPerf.event("pinch.cancel", { zoom }, undefined, "pinch");
    }
    if (pinchSurfaceRef.current) {
      pinchSurfaceRef.current.style.transform = "";
      pinchSurfaceRef.current.style.transformOrigin = "";
    }
    pinchRef.current.active = false;
    pinchRef.current.pendingZoom = null;
    pinchRef.current.pendingCommitZoom = null;
    pinchRef.current.pendingReadyPageIndexes = null;
    pinchRef.current.startDistance = 0;
    event.preventDefault();
  };

  return (
    <div
      ref={viewerRef}
      data-papyrus-theme={uiTheme}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className={`papyrus-viewer papyrus-theme min-h-0 min-w-0 w-full flex-1 ${viewerOverflowClass} flex flex-col items-center ${paddingY} relative custom-scrollbar scroll-smooth ${
        isDark ? "bg-[#121212]" : "bg-[#e9ecef]"
      }`}
      style={viewerStyle}
    >
      <div
        ref={pinchSurfaceRef}
        className="flex flex-col items-center gap-6 w-full min-w-0"
      >
        {!isSingleViewportMode && wrapperPageWindow.beforeCount > 0 && (
          <div
            aria-hidden="true"
            style={{
              height: wrapperPageWindow.beforeCount * virtualItemHeight,
            }}
          />
        )}
        {pages.map((idx) => (
          <div
            key={isSingleViewportMode ? "single-viewport" : idx}
            ref={(element) => {
              pageRefs.current[idx] = element;
            }}
            data-page-index={idx}
            className={`page-container ${
              isSingleViewportMode ? "relative" : ""
            }`}
          >
            {idx >= renderPageWindow.start && idx <= renderPageWindow.end ? (
              <PageRenderer
                engine={engine}
                pageIndex={idx}
                availableWidth={availableWidth ?? undefined}
                availableHeight={availableHeight ?? undefined}
                onMeasuredSize={handlePageMeasured}
                onRenderReady={handlePinchRenderReady}
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
        {!isSingleViewportMode && wrapperPageWindow.afterCount > 0 && (
          <div
            aria-hidden="true"
            style={{
              height: wrapperPageWindow.afterCount * virtualItemHeight,
            }}
          />
        )}
      </div>
      {isSingleViewportMode && pageCount > 1 && viewerBounds && (
        <div
          className="pointer-events-none fixed z-[75] flex items-center justify-between px-1.5 sm:px-2.5"
          style={{
            left: viewerBounds.left,
            width: viewerBounds.width,
            top: viewerBounds.top + viewerBounds.height / 2,
            transform: "translateY(-50%)",
          }}
        >
          <button
            onClick={() => navigateBy(-1)}
            disabled={!canGoPrev}
            className={`pointer-events-auto h-12 w-9 sm:h-14 sm:w-10 rounded-lg border backdrop-blur-md transition-all ${
              !canGoPrev
                ? "opacity-40 cursor-not-allowed"
                : "hover:scale-[1.03] active:scale-95"
            } ${
              isDark
                ? "bg-[#111827]/85 text-gray-100"
                : "bg-white/90 text-gray-700"
            }`}
            style={{
              borderColor: withAlpha(accentColor, isDark ? 0.45 : 0.3),
              color: !canGoPrev ? undefined : accentColor,
              boxShadow: `0 10px 24px ${withAlpha(
                accentColor,
                isDark ? 0.18 : 0.12
              )}`,
            }}
            aria-label="Capítulo anterior"
            title="Capítulo anterior"
          >
            <svg
              className="w-5 h-5 mx-auto"
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
          <button
            onClick={() => navigateBy(1)}
            disabled={!canGoNext}
            className={`pointer-events-auto h-12 w-9 sm:h-14 sm:w-10 rounded-lg border backdrop-blur-md transition-all ${
              !canGoNext
                ? "opacity-40 cursor-not-allowed"
                : "hover:scale-[1.03] active:scale-95"
            } ${
              isDark
                ? "bg-[#111827]/85 text-gray-100"
                : "bg-white/90 text-gray-700"
            }`}
            style={{
              borderColor: withAlpha(accentColor, isDark ? 0.45 : 0.3),
              color: !canGoNext ? undefined : accentColor,
              boxShadow: `0 10px 24px ${withAlpha(
                accentColor,
                isDark ? 0.18 : 0.12
              )}`,
            }}
            aria-label="Próximo capítulo"
            title="Próximo capítulo"
          >
            <svg
              className="w-5 h-5 mx-auto"
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
