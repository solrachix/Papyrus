import React, {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";
import {
  Animated,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  PixelRatio,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  createPageLayoutMetrics,
  resolveRenderOverscan,
  scalePageLayoutMetrics,
  useViewerStore,
  type BasePageLayoutMetrics,
} from "@papyrus-sdk/core";
import { DocumentEngine, PdfViewerMode } from "@papyrus-sdk/types";
import PageRenderer from "./PageRenderer";
import WebViewViewer from "./WebViewViewer";
import NativePdfDocumentViewer, {
  getNativePdfEngineId,
} from "./NativePdfDocumentViewer";
import { shouldUseNativePdfViewer } from "./nativePdfViewerMode";
import { resolvePdfBasePageWidth } from "./pdfPageMetrics";
import {
  createBurstMonitor,
  createRenderCounter,
  createScrollPerfMonitor,
  isMobilePerfEnabled,
  logPerfEvent,
  perfNow,
  sampleMemory,
} from "../perf/mobilePerf";
import { useMobilePerf } from "../perf/MobilePerfContext";
import { createPinchPerfMachine } from "../perf/pinchPerfSession";
import {
  getSelectionEdgeAutoscroll,
  shouldEnableViewerScroll,
} from "../gesture/selectionInteraction";
import {
  DEFAULT_PINCH_ZOOM_BOUNDS,
  resolvePinchGestureZoom,
  resolvePinchPreviewScale,
  sanitizePinchPreviewScale,
} from "../gesture/pinchZoom";
import {
  resolvePdfAnchoredScrollX,
  resolvePdfAnchoredScrollY,
  resolvePdfGlobalScrollX,
  resolvePdfSurfaceWidth,
  resolvePdfVerticalAnchorMode,
} from "../viewport/pdfViewportController";
import {
  pageContainsScrollTarget,
  resolveViewerScrollTarget,
  type ViewerScrollTarget,
} from "./viewerNavigation";
import { resolvePageTapChromeVisibility } from "./mobileChromeInteraction";

export interface ViewerProps {
  engine: DocumentEngine;
  virtualWindowSize?: number;
  maxToRenderPerBatch?: number;
  removeClippedSubviews?: boolean;
  useDedicatedAndroidPdfViewer?: boolean;
  viewerMode?: PdfViewerMode;
}

const LIST_TOP_PADDING = 18;
const LIST_BOTTOM_PADDING = 120;
const CONTINUOUS_PAGE_SPACING = 28;
const DOUBLE_PAGE_SPACING = 20;
const DEFAULT_PAGE_ASPECT_RATIO = 0.77;
const FLATLIST_MAX_TO_RENDER_PER_BATCH = 6;
const FLATLIST_UPDATE_CELLS_BATCHING_PERIOD = 40;
const FLATLIST_INITIAL_NUM_TO_RENDER = 6;
const SCROLL_RETRY_DELAY_MS = 120;
const SCROLL_MAX_RETRIES = 10;
const MOBILE_CHROME_HIDE_DELTA = 28;
const MOBILE_CHROME_SHOW_DELTA = 22;
const MOBILE_CHROME_SHOW_DELAY_MS = 180;
const MOBILE_CHROME_TOP_RESET = 16;
const SELECTION_EDGE_THRESHOLD_PX = 48;
const SELECTION_EDGE_MAX_STEP_PX = 24;

const resolvePositiveInt = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.max(min, Math.min(max, rounded));
};

type PendingPinchAnchorRestore = {
  finalZoom: number;
  focalY: number;
  viewerScrollOffsetY: number;
  pageIndex: number;
  startPageOffsetY: number;
  startPageHeight: number;
  startContentHeight: number;
  usePageVerticalAnchor: boolean;
  startSurfaceScrollX: number;
  startSurfaceWidth: number;
  pageViewportWidth: number;
  pageHorizontalPadding: number;
  pageViewportContentOffsetX: number;
};

const Viewer: React.FC<ViewerProps> = ({
  engine,
  virtualWindowSize,
  maxToRenderPerBatch,
  removeClippedSubviews,
  useDedicatedAndroidPdfViewer,
  viewerMode,
}) => {
  const pageCount = useViewerStore((state) => state.pageCount);
  const currentPage = useViewerStore((state) => state.currentPage);
  const scrollToPageSignal = useViewerStore(
    (state) => state.scrollToPageSignal
  );
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const mobileChromeVisible = useViewerStore(
    (state) => state.mobileChromeVisible
  );
  const selectionActive = useViewerStore((state) => state.selectionActive);
  const activeTool = useViewerStore((state) => state.activeTool);
  const uiTheme = useViewerStore((state) => state.uiTheme);
  const viewMode = useViewerStore((state) => state.viewMode);
  const zoom = useViewerStore((state) => state.zoom);
  const storeViewerMode = useViewerStore((state) => state.viewerMode);
  const listRef = useRef<FlatList<any>>(null);
  const horizontalScrollRef = useRef<ScrollView | null>(null);
  const isDark = uiTheme === "dark";
  const { width: windowWidth } = useWindowDimensions();
  const isDouble = viewMode === "double";
  const isSingle = viewMode === "single";
  const renderTargetType = engine.getRenderTargetType?.() ?? "canvas";
  const isWebView = renderTargetType === "webview";
  const resolvedViewerMode =
    viewerMode ?? (useDedicatedAndroidPdfViewer ? "native" : storeViewerMode);
  const mobilePerf = useMobilePerf();
  const pinchPerfMachine = useMemo(
    () => createPinchPerfMachine(mobilePerf),
    [mobilePerf]
  );

  useEffect(() => {
    mobilePerf.emit("viewer.mode", { mode: resolvedViewerMode });
  }, [mobilePerf, resolvedViewerMode]);
  const nativeEngineId = getNativePdfEngineId(engine);
  const isNativePdfViewer = shouldUseNativePdfViewer({
    viewerMode: resolvedViewerMode,
    pageCount,
    isWebView,
    nativeEngineId,
  });
  const perfEnabled = isMobilePerfEnabled();
  const mountedAtRef = useRef(perfNow());
  const readyLoggedRef = useRef(false);
  const renderCounterRef = useRef(createRenderCounter("Viewer", "render", 40));
  const setStateBurstRef = useRef(
    createBurstMonitor("Viewer", "setDocumentState", 12, 800)
  );
  const viewableBurstRef = useRef(
    createBurstMonitor("Viewer", "onViewableItemsChanged", 12, 800)
  );
  const scrollMonitorRef = useRef(createScrollPerfMonitor("Viewer"));
  const dimensionsCacheRef = useRef<
    Map<number, { width: number; height: number }>
  >(new Map());
  const dimensionsPendingRef = useRef<Set<number>>(new Set());
  const layoutRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingScrollTargetRef = useRef<ViewerScrollTarget | null>(null);
  const pendingScrollAttemptsRef = useRef(0);
  const pendingScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingChromeShowTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const chromeVisibleRef = useRef(mobileChromeVisible);
  const lastScrollOffsetYRef = useRef(0);
  const scrollDownAccumRef = useRef(0);
  const scrollUpAccumRef = useRef(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [selectionDragActive, setSelectionDragActive] = useState(false);
  const selectionDragActiveRef = useRef(false);
  const [gestureScrollLockActive, setGestureScrollLockActive] = useState(false);
  const gestureScrollLockActiveRef = useRef(false);
  const pinchPreviewScale = useRef(new Animated.Value(1)).current;
  const pinchPreviewFocalX = useRef(new Animated.Value(0)).current;
  const pinchPreviewFocalY = useRef(new Animated.Value(0)).current;
  const pinchPreviewNegativeFocalX = useRef(new Animated.Value(0)).current;
  const pinchPreviewNegativeFocalY = useRef(new Animated.Value(0)).current;
  const [lastPinchEndedAt, setLastPinchEndedAt] = useState<number | null>(null);
  const pinchGestureActiveRef = useRef(false);
  const pinchStartZoomRef = useRef(1);
  const pinchPreviewZoomRef = useRef(1);
  const pinchFocalPointRef = useRef({ x: 0, y: 0 });
  const pinchUpdateLoggedAtRef = useRef(0);
  const pinchStartScrollYRef = useRef(0);
  const pinchStartSurfaceScrollXRef = useRef(0);
  const pinchStartSurfaceWidthRef = useRef(0);
  const horizontalScrollOffsetRef = useRef(0);
  const pendingPinchAnchorRestoreRef = useRef<PendingPinchAnchorRestore | null>(
    null
  );
  const pendingPinchRenderZoomRef = useRef<number | null>(null);
  const pendingPinchRenderPageRef = useRef<number | null>(null);
  const pendingPinchGestureIdRef = useRef<string | null>(null);
  const committedPinchGestureIdRef = useRef<string | null>(null);
  const pinchAnchorRestoreFrameRef = useRef<number | null>(null);
  const viewerFrameRef = useRef({ y: 0, height: 0 });
  const viewerContentHeightRef = useRef(0);
  const listLayoutMetricsRef = useRef<BasePageLayoutMetrics | null>(null);
  const resolvedWindowSize = useMemo(
    () =>
      resolvePositiveInt(
        virtualWindowSize,
        resolveRenderOverscan({
          zoom,
          estimatedPagePixels:
            Math.max(1, windowWidth * zoom) ** 2 / DEFAULT_PAGE_ASPECT_RATIO,
          viewportHeight: 900,
          devicePixelRatio: PixelRatio.get(),
        }),
        2,
        30
      ),
    [virtualWindowSize, windowWidth, zoom]
  );
  const resolvedMaxToRenderPerBatch = useMemo(
    () =>
      resolvePositiveInt(
        maxToRenderPerBatch,
        FLATLIST_MAX_TO_RENDER_PER_BATCH,
        1,
        30
      ),
    [maxToRenderPerBatch]
  );
  const resolvedRemoveClippedSubviews = removeClippedSubviews ?? true;

  renderCounterRef.current({
    pageCount,
    currentPage,
    viewMode,
    renderTargetType,
  });

  const pages = useMemo(
    () => Array.from({ length: pageCount }).map((_, i) => i),
    [pageCount]
  );
  const rows = useMemo(() => {
    if (!isDouble) return [];
    const result: Array<{ left: number; right: number | null }> = [];
    for (let i = 0; i < pageCount; i += 2) {
      result.push({ left: i, right: i + 1 < pageCount ? i + 1 : null });
    }
    return result;
  }, [isDouble, pageCount]);

  const scheduleLayoutRefresh = useCallback(() => {
    if (layoutRefreshTimeoutRef.current) return;
    layoutRefreshTimeoutRef.current = setTimeout(() => {
      layoutRefreshTimeoutRef.current = null;
      setLayoutRevision((value) => value + 1);
    }, 120);
  }, []);

  const clearPendingScrollRetry = useCallback(() => {
    if (pendingScrollTimeoutRef.current) {
      clearTimeout(pendingScrollTimeoutRef.current);
      pendingScrollTimeoutRef.current = null;
    }
  }, []);

  const clearPendingScrollTarget = useCallback(() => {
    pendingScrollTargetRef.current = null;
    pendingScrollAttemptsRef.current = 0;
    clearPendingScrollRetry();
  }, [clearPendingScrollRetry]);

  const clearPendingChromeShow = useCallback(() => {
    if (pendingChromeShowTimeoutRef.current) {
      clearTimeout(pendingChromeShowTimeoutRef.current);
      pendingChromeShowTimeoutRef.current = null;
    }
  }, []);

  const scheduleScrollRetry = useCallback(
    (reason: string) => {
      const pendingTarget = pendingScrollTargetRef.current;
      if (pendingTarget === null) return;
      if (pendingScrollAttemptsRef.current >= SCROLL_MAX_RETRIES) {
        if (perfEnabled) {
          logPerfEvent("Viewer", "scroll.retry.giveup", {
            reason,
            targetIndex: pendingTarget.listIndex,
            targetPageIndex: pendingTarget.pageIndex,
            attempts: pendingScrollAttemptsRef.current,
          });
        }
        clearPendingScrollTarget();
        return;
      }

      clearPendingScrollRetry();
      pendingScrollTimeoutRef.current = setTimeout(() => {
        pendingScrollTimeoutRef.current = null;
        const targetIndex = pendingScrollTargetRef.current?.listIndex;
        if (targetIndex === undefined) return;
        pendingScrollAttemptsRef.current += 1;
        listRef.current?.scrollToIndex({
          index: targetIndex,
          animated: false,
          viewPosition: 0,
        });
        if (perfEnabled) {
          logPerfEvent("Viewer", "scroll.retry", {
            reason,
            targetIndex,
            attempt: pendingScrollAttemptsRef.current,
          });
        }
      }, SCROLL_RETRY_DELAY_MS);
    },
    [clearPendingScrollRetry, clearPendingScrollTarget, perfEnabled]
  );

  useEffect(
    () => () => {
      if (layoutRefreshTimeoutRef.current) {
        clearTimeout(layoutRefreshTimeoutRef.current);
      }
      if (pinchAnchorRestoreFrameRef.current !== null) {
        cancelAnimationFrame(pinchAnchorRestoreFrameRef.current);
      }
      clearPendingScrollRetry();
      clearPendingChromeShow();
    },
    [clearPendingChromeShow, clearPendingScrollRetry]
  );

  const ensurePageDimensions = useCallback(
    (pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= pageCount) return;
      if (dimensionsCacheRef.current.has(pageIndex)) return;
      if (dimensionsPendingRef.current.has(pageIndex)) return;

      dimensionsPendingRef.current.add(pageIndex);
      void engine
        .getPageDimensions(pageIndex)
        .then((dims) => {
          if (dims.width <= 0 || dims.height <= 0) return;
          const previous = dimensionsCacheRef.current.get(pageIndex);
          if (
            previous &&
            previous.width === dims.width &&
            previous.height === dims.height
          ) {
            return;
          }
          dimensionsCacheRef.current.set(pageIndex, {
            width: dims.width,
            height: dims.height,
          });
          scheduleLayoutRefresh();
        })
        .catch((error: unknown) => {
          if (!perfEnabled) return;
          logPerfEvent("Viewer", "pageDimensions.error", {
            page: pageIndex + 1,
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          dimensionsPendingRef.current.delete(pageIndex);
        });
    },
    [engine, pageCount, perfEnabled, scheduleLayoutRefresh]
  );

  const getPageAspectRatio = useCallback((pageIndex: number) => {
    const dims = dimensionsCacheRef.current.get(pageIndex);
    if (!dims || dims.width <= 0 || dims.height <= 0) {
      return DEFAULT_PAGE_ASPECT_RATIO;
    }
    return dims.width / dims.height;
  }, []);

  useEffect(() => {
    if (!perfEnabled) return;
    logPerfEvent("Viewer", "mount", {
      viewMode,
      renderTargetType,
      virtualWindowSize: resolvedWindowSize,
      maxToRenderPerBatch: resolvedMaxToRenderPerBatch,
      removeClippedSubviews: resolvedRemoveClippedSubviews,
    });
    sampleMemory("Viewer", "mount", { pageCount });
    return () => {
      logPerfEvent("Viewer", "unmount");
    };
  }, [
    perfEnabled,
    renderTargetType,
    resolvedMaxToRenderPerBatch,
    resolvedRemoveClippedSubviews,
    resolvedWindowSize,
    viewMode,
  ]);

  useEffect(() => {
    if (!perfEnabled || readyLoggedRef.current || pageCount <= 0) return;
    readyLoggedRef.current = true;
    logPerfEvent("Viewer", "document.ready", {
      pageCount,
      initialLoadMs: Math.round((perfNow() - mountedAtRef.current) * 100) / 100,
    });
    sampleMemory("Viewer", "document.ready", { pageCount });
  }, [pageCount, perfEnabled]);

  useEffect(() => {
    if (isWebView || isSingle || pageCount <= 0) return;
    const warmupCount = Math.min(pageCount, 12);
    for (let i = 0; i < warmupCount; i += 1) {
      ensurePageDimensions(i);
    }
  }, [ensurePageDimensions, isSingle, isWebView, pageCount]);

  const setDocumentStateTracked = useCallback(
    (state: Parameters<typeof setDocumentState>[0], reason: string) => {
      if (perfEnabled) {
        setStateBurstRef.current({
          reason,
          keys: Object.keys(state).join(","),
        });
      }
      setDocumentState(state);
    },
    [perfEnabled, setDocumentState]
  );

  useEffect(() => {
    chromeVisibleRef.current = mobileChromeVisible;
  }, [mobileChromeVisible]);

  const setMobileChromeVisible = useCallback(
    (visible: boolean, reason: string) => {
      if (chromeVisibleRef.current === visible) return;
      chromeVisibleRef.current = visible;
      setDocumentStateTracked({ mobileChromeVisible: visible }, reason);
    },
    [setDocumentStateTracked]
  );

  const resetMobileChromeTracking = useCallback(
    (showChrome: boolean, reason: string) => {
      lastScrollOffsetYRef.current = 0;
      scrollDownAccumRef.current = 0;
      scrollUpAccumRef.current = 0;
      clearPendingChromeShow();
      if (showChrome) {
        setMobileChromeVisible(true, reason);
      }
    },
    [clearPendingChromeShow, setMobileChromeVisible]
  );

  const trackMobileChromeByOffset = useCallback(
    (offsetY: number, reasonPrefix: string) => {
      if (pageCount <= 0) return;

      const safeOffset = Math.max(0, offsetY);
      const delta = safeOffset - lastScrollOffsetYRef.current;
      lastScrollOffsetYRef.current = safeOffset;

      if (safeOffset <= MOBILE_CHROME_TOP_RESET) {
        scrollDownAccumRef.current = 0;
        scrollUpAccumRef.current = 0;
        clearPendingChromeShow();
        setMobileChromeVisible(true, `${reasonPrefix}.top`);
        return;
      }

      if (Math.abs(delta) < 1) return;

      if (delta > 0) {
        scrollDownAccumRef.current += delta;
        scrollUpAccumRef.current = 0;
        clearPendingChromeShow();
        if (
          scrollDownAccumRef.current >= MOBILE_CHROME_HIDE_DELTA &&
          chromeVisibleRef.current
        ) {
          scrollDownAccumRef.current = 0;
          setMobileChromeVisible(false, `${reasonPrefix}.hide`);
        }
        return;
      }

      scrollUpAccumRef.current += -delta;
      scrollDownAccumRef.current = 0;
      if (
        scrollUpAccumRef.current >= MOBILE_CHROME_SHOW_DELTA &&
        !chromeVisibleRef.current
      ) {
        if (!pendingChromeShowTimeoutRef.current) {
          pendingChromeShowTimeoutRef.current = setTimeout(() => {
            pendingChromeShowTimeoutRef.current = null;
            scrollUpAccumRef.current = 0;
            if (!chromeVisibleRef.current) {
              setMobileChromeVisible(true, `${reasonPrefix}.show`);
            }
          }, MOBILE_CHROME_SHOW_DELAY_MS);
        }
      }
    },
    [clearPendingChromeShow, pageCount, setMobileChromeVisible]
  );

  useEffect(() => {
    resetMobileChromeTracking(true, "mobileChrome.reset");
  }, [isSingle, isWebView, pageCount, resetMobileChromeTracking]);

  useEffect(
    () => () => {
      setDocumentState({ mobileChromeVisible: true });
    },
    [setDocumentState]
  );

  const columnGap = 12;
  const horizontalPadding = 16;
  const columnWidth = isDouble
    ? (windowWidth - horizontalPadding * 2 - columnGap) / 2
    : windowWidth;

  const getPageWidthForZoom = useCallback(
    (pageIndex: number, zoomValue: number) => {
      const safeZoom = Math.max(zoomValue, 0.25);
      const baseWidth = resolvePdfBasePageWidth({
        viewportWidth: isDouble ? columnWidth : windowWidth,
        horizontalPadding: isDouble ? 8 : 16,
      });
      return baseWidth * safeZoom;
    },
    [columnWidth, isDouble, windowWidth]
  );

  const getPageHeightForZoom = useCallback(
    (pageIndex: number, zoomValue: number) =>
      getPageWidthForZoom(pageIndex, zoomValue) / getPageAspectRatio(pageIndex),
    [getPageAspectRatio, getPageWidthForZoom]
  );

  const getPageViewportMetrics = useCallback(
    (pageIndex: number) => {
      if (isDouble) {
        const isRight = pageIndex % 2 === 1;
        return {
          viewportWidth: columnWidth,
          horizontalPadding: 8,
          viewportOffsetX:
            horizontalPadding + (isRight ? columnWidth + columnGap : 0),
        };
      }
      return {
        viewportWidth: windowWidth,
        horizontalPadding: 16,
        viewportOffsetX: 0,
      };
    },
    [columnGap, columnWidth, horizontalPadding, isDouble, windowWidth]
  );

  const documentSurfaceWidth = useMemo(() => {
    if (isDouble) {
      const leftPageWidth = getPageWidthForZoom(0, zoom);
      const doubleContentWidth = leftPageWidth * 2 + columnGap;
      return resolvePdfSurfaceWidth({
        viewportWidth: windowWidth,
        contentWidth: doubleContentWidth,
        horizontalPadding,
      });
    }

    return resolvePdfSurfaceWidth({
      viewportWidth: windowWidth,
      contentWidth: getPageWidthForZoom(currentPage - 1, zoom),
      horizontalPadding,
    });
  }, [
    columnGap,
    currentPage,
    getPageWidthForZoom,
    horizontalPadding,
    isDouble,
    windowWidth,
    zoom,
  ]);

  const getPageLayoutForZoom = useCallback(
    (pageIndex: number, zoomValue: number) => {
      const cachedMetrics = listLayoutMetricsRef.current;
      if (cachedMetrics && cachedMetrics.lengths.length > 0) {
        const itemIndex = isDouble ? Math.floor(pageIndex / 2) : pageIndex;
        const scaledMetrics = scalePageLayoutMetrics(
          cachedMetrics,
          Math.max(zoomValue, 0.25)
        );
        return {
          pageOffsetY: scaledMetrics.getOffset(itemIndex),
          pageHeight: getPageHeightForZoom(pageIndex, zoomValue),
          totalContentHeight: scaledMetrics.getTotalContentHeight(),
        };
      }
      if (isSingle) {
        const pageHeight = getPageHeightForZoom(pageIndex, zoomValue);
        return {
          pageOffsetY: 18,
          pageHeight,
          totalContentHeight: 18 + pageHeight + 140,
        };
      }

      if (isDouble) {
        let offsetY = LIST_TOP_PADDING;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const leftHeight = getPageHeightForZoom(row.left, zoomValue);
          const rightHeight =
            row.right === null
              ? leftHeight
              : getPageHeightForZoom(row.right, zoomValue);
          const rowLength =
            Math.max(leftHeight, rightHeight) + DOUBLE_PAGE_SPACING;
          if (row.left === pageIndex || row.right === pageIndex) {
            let totalContentHeight = LIST_TOP_PADDING;
            for (
              let totalRowIndex = 0;
              totalRowIndex < rows.length;
              totalRowIndex += 1
            ) {
              const totalRow = rows[totalRowIndex];
              const totalLeftHeight = getPageHeightForZoom(
                totalRow.left,
                zoomValue
              );
              const totalRightHeight =
                totalRow.right === null
                  ? totalLeftHeight
                  : getPageHeightForZoom(totalRow.right, zoomValue);
              totalContentHeight +=
                Math.max(totalLeftHeight, totalRightHeight) +
                DOUBLE_PAGE_SPACING;
            }
            totalContentHeight += LIST_BOTTOM_PADDING;
            return {
              pageOffsetY: offsetY,
              pageHeight: getPageHeightForZoom(pageIndex, zoomValue),
              totalContentHeight,
            };
          }
          offsetY += rowLength;
        }
      }

      let offsetY = LIST_TOP_PADDING;
      for (
        let currentPageIndex = 0;
        currentPageIndex < pageCount;
        currentPageIndex += 1
      ) {
        const currentPageHeight = getPageHeightForZoom(
          currentPageIndex,
          zoomValue
        );
        if (currentPageIndex === pageIndex) {
          let totalContentHeight = LIST_TOP_PADDING;
          for (
            let totalPageIndex = 0;
            totalPageIndex < pageCount;
            totalPageIndex += 1
          ) {
            totalContentHeight +=
              getPageHeightForZoom(totalPageIndex, zoomValue) +
              CONTINUOUS_PAGE_SPACING;
          }
          totalContentHeight += LIST_BOTTOM_PADDING;
          return {
            pageOffsetY: offsetY,
            pageHeight: currentPageHeight,
            totalContentHeight,
          };
        }
        offsetY += currentPageHeight + CONTINUOUS_PAGE_SPACING;
      }

      return {
        pageOffsetY: LIST_TOP_PADDING,
        pageHeight: getPageHeightForZoom(pageIndex, zoomValue),
        totalContentHeight:
          LIST_TOP_PADDING +
          getPageHeightForZoom(pageIndex, zoomValue) +
          CONTINUOUS_PAGE_SPACING +
          LIST_BOTTOM_PADDING,
      };
    },
    [getPageHeightForZoom, isDouble, isSingle, pageCount, rows, zoom]
  );

  const resolvePinchAnchorPageIndex = useCallback(
    (
      focalX: number,
      focalY: number,
      zoomValue: number,
      scrollOffsetY = lastScrollOffsetYRef.current
    ) => {
      if (isSingle) {
        return Math.max(0, currentPage - 1);
      }

      const contentY = Math.max(0, scrollOffsetY + focalY);
      const cachedMetrics = listLayoutMetricsRef.current;
      if (cachedMetrics && cachedMetrics.lengths.length > 0) {
        const scaledMetrics = scalePageLayoutMetrics(
          cachedMetrics,
          Math.max(zoomValue, 0.25)
        );
        let low = 0;
        let high = scaledMetrics.itemCount - 1;
        while (low < high) {
          const middle = Math.floor((low + high) / 2);
          const end = scaledMetrics.getOffset(middle) + scaledMetrics.getLength(middle);
          if (contentY <= end) high = middle;
          else low = middle + 1;
        }
        if (isDouble) {
          const row = rows[low];
          if (row) {
            const isRight =
              row.right !== null &&
              focalX > horizontalPadding + columnWidth + columnGap / 2;
            return isRight ? row.right! : row.left;
          }
        } else {
          return Math.min(low, pageCount - 1);
        }
      }
      if (isDouble) {
        let offsetY = LIST_TOP_PADDING;
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          const row = rows[rowIndex];
          const leftHeight = getPageHeightForZoom(row.left, zoomValue);
          const rightHeight =
            row.right === null
              ? leftHeight
              : getPageHeightForZoom(row.right, zoomValue);
          const rowLength =
            Math.max(leftHeight, rightHeight) + DOUBLE_PAGE_SPACING;
          if (contentY <= offsetY + rowLength || rowIndex === rows.length - 1) {
            const isRight =
              row.right !== null &&
              focalX > horizontalPadding + columnWidth + columnGap / 2;
            return isRight ? row.right! : row.left;
          }
          offsetY += rowLength;
        }
        return rows[rows.length - 1]?.left ?? 0;
      }

      let offsetY = LIST_TOP_PADDING;
      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        const pageLength =
          getPageHeightForZoom(pageIndex, zoomValue) + CONTINUOUS_PAGE_SPACING;
        if (contentY <= offsetY + pageLength || pageIndex === pageCount - 1) {
          return pageIndex;
        }
        offsetY += pageLength;
      }
      return Math.max(0, pageCount - 1);
    },
    [
      columnGap,
      columnWidth,
      currentPage,
      getPageHeightForZoom,
      horizontalPadding,
      isDouble,
      isSingle,
      pageCount,
      rows,
    ]
  );

  const resolvedViewerScrollEnabled = shouldEnableViewerScroll({
    selectionDragActive,
    gestureScrollLockActive,
  });

  const setViewerScrollEnabledNative = useCallback((enabled: boolean) => {
    const scrollNode = listRef.current as unknown as {
      setNativeProps?: (props: { scrollEnabled: boolean }) => void;
    } | null;
    scrollNode?.setNativeProps?.({ scrollEnabled: enabled });
  }, []);

  const syncViewerScrollEnabled = useCallback(
    (
      nextSelectionDragActive = selectionDragActiveRef.current,
      nextGestureScrollLockActive = gestureScrollLockActiveRef.current
    ) => {
      setViewerScrollEnabledNative(
        shouldEnableViewerScroll({
          selectionDragActive: nextSelectionDragActive,
          gestureScrollLockActive: nextGestureScrollLockActive,
        })
      );
    },
    [setViewerScrollEnabledNative]
  );

  const handleGestureScrollLockChange = useCallback(
    (active: boolean) => {
      if (gestureScrollLockActiveRef.current === active) return;
      gestureScrollLockActiveRef.current = active;
      setGestureScrollLockActive(active);
      syncViewerScrollEnabled(selectionDragActiveRef.current, active);
    },
    [syncViewerScrollEnabled]
  );

  const handlePinchPreviewScaleChange = useCallback(
    (scale: number, focalX = 0, focalY = 0) => {
      const nextScale = sanitizePinchPreviewScale(scale);
      pinchPreviewScale.setValue(nextScale);
      pinchPreviewFocalX.setValue(focalX);
      pinchPreviewFocalY.setValue(focalY);
      pinchPreviewNegativeFocalX.setValue(-focalX);
      pinchPreviewNegativeFocalY.setValue(-focalY);
    },
    []
  );

  const resetViewerPinchPreview = useCallback(() => {
    pinchPreviewZoomRef.current = pinchStartZoomRef.current;
    handlePinchPreviewScaleChange(1);
  }, [handlePinchPreviewScaleChange]);

  const handlePinchRenderReady = useCallback(
    (pageIndex: number, renderedZoom: number) => {
      const pendingZoom = pendingPinchRenderZoomRef.current;
      if (
        pendingZoom == null ||
        Math.abs(renderedZoom - pendingZoom) >= 0.001 ||
        pageIndex !== pendingPinchRenderPageRef.current
      ) {
        return;
      }
      if (!pinchPerfMachine.completeAfterRenderReady({ zoom: renderedZoom })) return;
      pendingPinchRenderZoomRef.current = null;
      pendingPinchRenderPageRef.current = null;
      pendingPinchGestureIdRef.current = null;
      committedPinchGestureIdRef.current = null;
      resetViewerPinchPreview();
    },
    [pinchPerfMachine, resetViewerPinchPreview]
  );

  const beginViewerPinch = useCallback(
    (focalX: number, focalY: number) => {
      const gestureId = pinchPerfMachine.begin({ startZoom: zoom });
      pinchGestureActiveRef.current = true;
      pendingPinchGestureIdRef.current = gestureId;
      committedPinchGestureIdRef.current = null;
      pendingPinchRenderZoomRef.current = null;
      pendingPinchRenderPageRef.current = null;
      pinchStartZoomRef.current = zoom;
      pinchPreviewZoomRef.current = zoom;
      pinchFocalPointRef.current = { x: focalX, y: focalY };
      pinchStartScrollYRef.current = lastScrollOffsetYRef.current;
      pinchStartSurfaceScrollXRef.current = horizontalScrollOffsetRef.current;
      pinchStartSurfaceWidthRef.current = documentSurfaceWidth;
      pinchUpdateLoggedAtRef.current = 0;
      setLastPinchEndedAt(null);
      handlePinchPreviewScaleChange(1, focalX, focalY);
      handleGestureScrollLockChange(true);
      if (perfEnabled) {
        logPerfEvent("Viewer", "pinch.start", {
          zoom: Math.round(zoom * 100) / 100,
        });
      }
    },
    [
      documentSurfaceWidth,
      handleGestureScrollLockChange,
      handlePinchPreviewScaleChange,
      perfEnabled,
      pinchPerfMachine,
      zoom,
    ]
  );

  const updateViewerPinch = useCallback(
    (scaleFactor: number, focalX: number, focalY: number) => {
      if (!pinchGestureActiveRef.current) return;
      pinchFocalPointRef.current = { x: focalX, y: focalY };
      const nextZoom = resolvePinchGestureZoom(
        pinchStartZoomRef.current,
        scaleFactor
      );
      pinchPreviewZoomRef.current = nextZoom;
      handlePinchPreviewScaleChange(
        resolvePinchPreviewScale(pinchStartZoomRef.current, nextZoom),
        focalX,
        focalY
      );
      if (!perfEnabled) return;
      const now = Date.now();
      if (now - pinchUpdateLoggedAtRef.current < 120) return;
      pinchUpdateLoggedAtRef.current = now;
      pinchPerfMachine.update({ zoom: nextZoom });
      logPerfEvent("Viewer", "pinch.update", {
        scale: Math.round(scaleFactor * 1000) / 1000,
        nextZoom: Math.round(nextZoom * 100) / 100,
      });
    },
    [handlePinchPreviewScaleChange, perfEnabled, pinchPerfMachine]
  );

  const cancelViewerPinch = useCallback(() => {
    if (!pinchGestureActiveRef.current) return;
    pinchGestureActiveRef.current = false;
    pinchPerfMachine.cancel("gesture-cancelled");
    pendingPinchRenderZoomRef.current = null;
    pendingPinchRenderPageRef.current = null;
    pendingPinchGestureIdRef.current = null;
    committedPinchGestureIdRef.current = null;
    pendingPinchAnchorRestoreRef.current = null;
    pinchPreviewZoomRef.current = pinchStartZoomRef.current;
    handlePinchPreviewScaleChange(1);
    handleGestureScrollLockChange(false);
  }, [handleGestureScrollLockChange, handlePinchPreviewScaleChange, pinchPerfMachine]);

  const finishViewerPinch = useCallback(() => {
    if (!pinchGestureActiveRef.current) return;
    pinchGestureActiveRef.current = false;
    const focalX = pinchFocalPointRef.current.x;
    const focalY = pinchFocalPointRef.current.y;
    const startZoom = pinchStartZoomRef.current;
    const viewerScrollOffsetY = pinchStartScrollYRef.current;
    const finalZoom = resolvePinchGestureZoom(
      pinchPreviewZoomRef.current || pinchStartZoomRef.current,
      1,
      DEFAULT_PINCH_ZOOM_BOUNDS
    );
    pinchPerfMachine.end({ finalZoom });
    setLastPinchEndedAt(Date.now());
    if (Math.abs(finalZoom - startZoom) >= 0.001) {
      const anchorPageIndex = resolvePinchAnchorPageIndex(
        focalX,
        focalY,
        startZoom,
        viewerScrollOffsetY
      );
      const {
        pageOffsetY: startPageOffsetY,
        pageHeight: startPageHeight,
        totalContentHeight: startContentHeight,
      } = getPageLayoutForZoom(anchorPageIndex, startZoom);
      const usePageVerticalAnchor =
        resolvePdfVerticalAnchorMode({
          focalY,
          startScrollY: viewerScrollOffsetY,
          startPageOffsetY,
          startPageHeight,
        }) === "page";
      const startSurfaceWidth = pinchStartSurfaceWidthRef.current;
      const {
        viewportWidth: pageViewportWidth,
        horizontalPadding: pageHorizontalPadding,
        viewportOffsetX,
      } = getPageViewportMetrics(anchorPageIndex);
      const pageViewportContentWidth = Math.max(
        0,
        pageViewportWidth - pageHorizontalPadding * 2
      );
      pendingPinchAnchorRestoreRef.current = {
        finalZoom,
        focalY,
        viewerScrollOffsetY,
        pageIndex: anchorPageIndex,
        startPageOffsetY,
        startPageHeight,
        startContentHeight,
        usePageVerticalAnchor,
        startSurfaceScrollX: pinchStartSurfaceScrollXRef.current,
        startSurfaceWidth,
        pageViewportWidth,
        pageHorizontalPadding,
        pageViewportContentOffsetX: Math.max(
          0,
          Math.min(
            pageViewportContentWidth,
            focalX - viewportOffsetX - pageHorizontalPadding
          )
        ),
      };
      pinchPerfMachine.commitStart();
      committedPinchGestureIdRef.current = pendingPinchGestureIdRef.current;
      setDocumentStateTracked({ zoom: finalZoom }, "pinch.viewerEnd");
      engine.setZoom(finalZoom);
      pinchPerfMachine.commitEnd({ zoom: finalZoom });
      pendingPinchRenderZoomRef.current = finalZoom;
      pendingPinchRenderPageRef.current = anchorPageIndex;
    } else {
      pendingPinchAnchorRestoreRef.current = null;
      pendingPinchRenderZoomRef.current = null;
      pendingPinchRenderPageRef.current = null;
      pendingPinchGestureIdRef.current = null;
      committedPinchGestureIdRef.current = null;
    }
    if (Math.abs(finalZoom - startZoom) < 0.001) {
      resetViewerPinchPreview();
    }
    handleGestureScrollLockChange(false);
    if (perfEnabled) {
      logPerfEvent("Viewer", "pinch.end", {
        finalZoom: Math.round(finalZoom * 100) / 100,
        page: pendingPinchAnchorRestoreRef.current?.pageIndex ?? null,
      });
    }
  }, [
    engine,
    documentSurfaceWidth,
    getPageLayoutForZoom,
    getPageViewportMetrics,
    handleGestureScrollLockChange,
    perfEnabled,
    pinchPerfMachine,
    resetViewerPinchPreview,
    resolvePinchAnchorPageIndex,
    setDocumentStateTracked,
    zoom,
  ]);

  const scrollHorizontalSurfaceTo = useCallback(
    (offsetX: number) => {
      const nextOffsetX = resolvePdfGlobalScrollX({
        focalViewportX: 0,
        startSurfaceScrollX: offsetX,
        startSurfaceWidth: documentSurfaceWidth,
        endSurfaceWidth: documentSurfaceWidth,
        viewportWidth: windowWidth,
      });
      horizontalScrollOffsetRef.current = nextOffsetX;
      horizontalScrollRef.current?.scrollTo({
        x: nextOffsetX,
        animated: false,
      });
      return nextOffsetX;
    },
    [documentSurfaceWidth, windowWidth]
  );

  const viewerPinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(!isWebView && pageCount > 0)
        .onTouchesDown((event) => {
          if ((event.allTouches?.length ?? 0) >= 2) {
            handleGestureScrollLockChange(true);
          }
        })
        .onTouchesUp((event) => {
          if (
            (event.allTouches?.length ?? 0) < 2 &&
            !pinchGestureActiveRef.current
          ) {
            handleGestureScrollLockChange(false);
          }
        })
        .runOnJS(true)
        .onStart((event) => {
          beginViewerPinch(event.focalX, event.focalY);
        })
        .onUpdate((event) => {
          updateViewerPinch(event.scale, event.focalX, event.focalY);
        })
        .onEnd(() => {
          finishViewerPinch();
        })
        .onFinalize(() => {
          if (pinchGestureActiveRef.current) {
            cancelViewerPinch();
          }
          handleGestureScrollLockChange(false);
        }),
    [
      cancelViewerPinch,
      beginViewerPinch,
      finishViewerPinch,
      handleGestureScrollLockChange,
      isWebView,
      pageCount,
      updateViewerPinch,
    ]
  );

  useEffect(() => {
    selectionDragActiveRef.current = selectionDragActive;
    syncViewerScrollEnabled(
      selectionDragActive,
      gestureScrollLockActiveRef.current
    );
  }, [selectionDragActive, syncViewerScrollEnabled]);

  useEffect(() => {
    const pendingRestore = pendingPinchAnchorRestoreRef.current;
    if (!pendingRestore) return;
    if (Math.abs(pendingRestore.finalZoom - zoom) >= 0.001) return;

    if (pinchAnchorRestoreFrameRef.current !== null) {
      cancelAnimationFrame(pinchAnchorRestoreFrameRef.current);
    }

    pinchAnchorRestoreFrameRef.current = requestAnimationFrame(() => {
      pinchAnchorRestoreFrameRef.current = null;

      const {
        pageOffsetY: endPageOffsetY,
        pageHeight: endPageHeight,
        totalContentHeight: endContentHeight,
      } = getPageLayoutForZoom(pendingRestore.pageIndex, zoom);
      const viewerViewportHeight = viewerFrameRef.current.height;
      const nextScrollY = resolvePdfAnchoredScrollY({
        mode: pendingRestore.usePageVerticalAnchor ? "page" : "document",
        focalY: pendingRestore.focalY,
        startScrollY: pendingRestore.viewerScrollOffsetY,
        startPageOffsetY: pendingRestore.startPageOffsetY,
        startPageHeight: pendingRestore.startPageHeight,
        startContentHeight: pendingRestore.startContentHeight,
        endPageOffsetY,
        endPageHeight,
        endContentHeight,
        viewportHeight: viewerViewportHeight,
      });

      if (isSingle) {
        (listRef.current as unknown as ScrollView | null)?.scrollTo?.({
          y: nextScrollY,
          animated: false,
        });
      } else {
        listRef.current?.scrollToOffset({
          offset: nextScrollY,
          animated: false,
        });
      }
      lastScrollOffsetYRef.current = nextScrollY;

      const endSurfaceWidth = documentSurfaceWidth;
      const pageViewportContentWidth = Math.max(
        0,
        pendingRestore.pageViewportWidth -
          pendingRestore.pageHorizontalPadding * 2
      );
      const nextOffsetX = resolvePdfAnchoredScrollX({
        focalViewportX: pendingRestore.pageViewportContentOffsetX,
        startSurfaceScrollX: pendingRestore.startSurfaceScrollX,
        startSurfaceWidth: pendingRestore.startSurfaceWidth,
        endSurfaceWidth,
        viewportWidth: pageViewportContentWidth,
      });
      const appliedOffsetX = scrollHorizontalSurfaceTo(nextOffsetX);
      pendingPinchAnchorRestoreRef.current = null;

      if (perfEnabled) {
        logPerfEvent("Viewer", "pinch.anchorRestore", {
          page: pendingRestore.pageIndex + 1,
          verticalAnchor: pendingRestore.usePageVerticalAnchor
            ? "page"
            : "document",
          scrollY: Math.round(nextScrollY * 100) / 100,
          scrollX: Math.round(appliedOffsetX * 100) / 100,
          zoom: Math.round(zoom * 100) / 100,
        });
      }
    });

    return () => {
      if (pinchAnchorRestoreFrameRef.current !== null) {
        cancelAnimationFrame(pinchAnchorRestoreFrameRef.current);
        pinchAnchorRestoreFrameRef.current = null;
      }
    };
  }, [
    documentSurfaceWidth,
    getPageLayoutForZoom,
    isSingle,
    perfEnabled,
    scrollHorizontalSurfaceTo,
    zoom,
  ]);

  useEffect(() => {
    if (zoom > 1 && documentSurfaceWidth > windowWidth) return;
    scrollHorizontalSurfaceTo(0);
  }, [documentSurfaceWidth, scrollHorizontalSurfaceTo, windowWidth, zoom]);

  const captureViewerFrame = useCallback((node: unknown) => {
    const measurable = node as {
      measureInWindow?: (
        callback: (x: number, y: number, width: number, height: number) => void
      ) => void;
    } | null;
    measurable?.measureInWindow?.((_, y, __, height) => {
      viewerFrameRef.current = { y, height };
    });
  }, []);

  const scrollViewerBy = useCallback(
    (deltaY: number) => {
      if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
      const viewportHeight = viewerFrameRef.current.height;
      const maxOffset = Math.max(
        0,
        viewerContentHeightRef.current - viewportHeight
      );
      const nextOffset = Math.max(
        0,
        Math.min(maxOffset, lastScrollOffsetYRef.current + deltaY)
      );
      const appliedDelta = nextOffset - lastScrollOffsetYRef.current;
      if (appliedDelta === 0) return 0;
      lastScrollOffsetYRef.current = nextOffset;
      if (isSingle) {
        (listRef.current as unknown as ScrollView | null)?.scrollTo?.({
          y: nextOffset,
          animated: false,
        });
        return appliedDelta;
      }
      listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
      return appliedDelta;
    },
    [isSingle]
  );

  const handleSelectionVerticalAutoscroll = useCallback(
    (absoluteY: number) => {
      const frame = viewerFrameRef.current;
      if (!Number.isFinite(absoluteY) || frame.height <= 0) return 0;
      const relativeY = absoluteY - frame.y;
      const { dy } = getSelectionEdgeAutoscroll({
        x: SELECTION_EDGE_THRESHOLD_PX,
        y: relativeY,
        width: SELECTION_EDGE_THRESHOLD_PX * 2,
        height: frame.height,
        threshold: SELECTION_EDGE_THRESHOLD_PX,
        maxStep: SELECTION_EDGE_MAX_STEP_PX,
      });
      return scrollViewerBy(dy);
    },
    [scrollViewerBy]
  );

  const listLayoutMetrics = useMemo(() => {
    if (isDouble) {
      const pageWidth =
        resolvePdfBasePageWidth({
          viewportWidth: columnWidth,
          horizontalPadding: 8,
        });
      return createPageLayoutMetrics({
        itemCount: rows.length,
        itemSpacing: DOUBLE_PAGE_SPACING,
        topPadding: LIST_TOP_PADDING,
        bottomPadding: LIST_BOTTOM_PADDING,
        estimatedLength:
          pageWidth / DEFAULT_PAGE_ASPECT_RATIO + DOUBLE_PAGE_SPACING,
        getBaseItemLength: (index) => {
          const row = rows[index];
          if (!row) return pageWidth / DEFAULT_PAGE_ASPECT_RATIO + DOUBLE_PAGE_SPACING;
          const leftHeight = pageWidth / getPageAspectRatio(row.left);
          const rightHeight =
            row.right === null
              ? leftHeight
              : pageWidth / getPageAspectRatio(row.right);
          return Math.max(leftHeight, rightHeight) + DOUBLE_PAGE_SPACING;
        },
      });
    }

    const pageWidth =
      resolvePdfBasePageWidth({
        viewportWidth: windowWidth,
        horizontalPadding: 16,
      });
    return createPageLayoutMetrics({
      itemCount: pageCount,
      itemSpacing: CONTINUOUS_PAGE_SPACING,
      topPadding: LIST_TOP_PADDING,
      bottomPadding: LIST_BOTTOM_PADDING,
      estimatedLength:
        pageWidth / DEFAULT_PAGE_ASPECT_RATIO + CONTINUOUS_PAGE_SPACING,
      getBaseItemLength: (index) =>
        pageWidth / getPageAspectRatio(index) + CONTINUOUS_PAGE_SPACING,
    });
  }, [
    columnWidth,
    getPageAspectRatio,
    isDouble,
    layoutRevision,
    pageCount,
    rows,
    windowWidth,
  ]);
  listLayoutMetricsRef.current = listLayoutMetrics;
  const scaledListLayoutMetrics = useMemo(
    () => scalePageLayoutMetrics(listLayoutMetrics, Math.max(zoom, 0.25)),
    [listLayoutMetrics, zoom]
  );

  const getFallbackOffsetForIndex = useCallback(
    (index: number) => {
      if (scaledListLayoutMetrics.itemCount === 0) return LIST_TOP_PADDING;
      return scaledListLayoutMetrics.getOffset(index);
    },
    [scaledListLayoutMetrics]
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => {
      if (scaledListLayoutMetrics.itemCount === 0) {
        return {
          index,
          length: scaledListLayoutMetrics.getLength(0),
          offset: LIST_TOP_PADDING,
        };
      }

      const safeIndex = Math.max(0, Math.min(index, scaledListLayoutMetrics.itemCount - 1));

      if (isDouble) {
        const row = rows[safeIndex];
        if (row) {
          ensurePageDimensions(row.left);
          if (row.right !== null) {
            ensurePageDimensions(row.right);
          }
        }
      } else {
        ensurePageDimensions(safeIndex);
      }

      return {
        index,
        length: scaledListLayoutMetrics.getLength(safeIndex),
        offset: scaledListLayoutMetrics.getOffset(safeIndex),
      };
    },
    [ensurePageDimensions, isDouble, rows, scaledListLayoutMetrics]
  );

  useEffect(() => {
    if (isWebView) {
      clearPendingScrollTarget();
      if (scrollToPageSignal === null) return;
      if (pageCount === 0) return;
      if (scrollToPageSignal < 0 || scrollToPageSignal >= pageCount) return;
      const nextPage = scrollToPageSignal + 1;
      engine.goToPage(nextPage);
      setDocumentStateTracked(
        { currentPage: nextPage, scrollToPageSignal: null },
        "scrollToPageSignal.webview"
      );
      return;
    }

    if (scrollToPageSignal === null) return;
    if (pageCount === 0) return;
    if (scrollToPageSignal < 0 || scrollToPageSignal >= pageCount) return;
    if (isSingle) {
      clearPendingScrollTarget();
      setDocumentStateTracked(
        { currentPage: scrollToPageSignal + 1, scrollToPageSignal: null },
        "scrollToPageSignal.single"
      );
      return;
    }

    ensurePageDimensions(scrollToPageSignal);
    if (isDouble) {
      ensurePageDimensions(scrollToPageSignal - 1);
      ensurePageDimensions(scrollToPageSignal + 1);
    }

    const target = resolveViewerScrollTarget(scrollToPageSignal, isDouble);
    pendingScrollTargetRef.current = target;
    pendingScrollAttemptsRef.current = 0;
    clearPendingScrollRetry();
    setDocumentStateTracked(
      {
        currentPage: scrollToPageSignal + 1,
        scrollToPageSignal: null,
      },
      "scrollToPageSignal.flatList"
    );

    listRef.current?.scrollToIndex({
      index: target.listIndex,
      animated: true,
      viewPosition: 0,
    });
  }, [
    clearPendingScrollRetry,
    clearPendingScrollTarget,
    ensurePageDimensions,
    scrollToPageSignal,
    pageCount,
    setDocumentStateTracked,
    isDouble,
    isSingle,
    isWebView,
    engine,
  ]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      if (perfEnabled) {
        viewableBurstRef.current({
          viewableCount: viewableItems.length,
          mode: isDouble ? "double" : "continuous",
        });
      }

      const pendingTarget = pendingScrollTargetRef.current;
      let reachedPendingTarget = false;
      if (pendingTarget !== null) {
        const reachedTarget = viewableItems.some((token) => {
          if (isDouble) {
            const row = token.item as
              | { left: number; right: number | null }
              | undefined;
            if (!row) return false;
            return pageContainsScrollTarget(row, pendingTarget.pageIndex);
          }

          return token.index === pendingTarget.listIndex;
        });

        if (reachedTarget) {
          reachedPendingTarget = true;
          if (perfEnabled) {
            logPerfEvent("Viewer", "scroll.retry.resolved", {
              targetPageIndex: pendingTarget.pageIndex,
              targetListIndex: pendingTarget.listIndex,
              attempts: pendingScrollAttemptsRef.current,
            });
          }
          clearPendingScrollTarget();
          setDocumentStateTracked(
            { currentPage: pendingTarget.pageIndex + 1 },
            "viewable.target"
          );
        }
      }

      const first = viewableItems[0];
      if (!first) return;
      if (reachedPendingTarget) return;
      if (isDouble) {
        const item = first.item as
          | { left: number; right: number | null }
          | undefined;
        if (!item) return;
        ensurePageDimensions(item.left);
        if (item.right !== null) {
          ensurePageDimensions(item.right);
        }
        const page = item.left + 1;
        if (page !== currentPage) {
          setDocumentStateTracked({ currentPage: page }, "viewable.double");
        }
        return;
      }

      if (first.index !== null && first.index !== undefined) {
        ensurePageDimensions(first.index);
        const page = first.index + 1;
        if (page !== currentPage) {
          setDocumentStateTracked({ currentPage: page }, "viewable.continuous");
        }
      }
    },
    [
      clearPendingScrollTarget,
      currentPage,
      ensurePageDimensions,
      isDouble,
      perfEnabled,
      setDocumentStateTracked,
    ]
  );

  const handleViewerScroll = useCallback(
    (
      event: {
        nativeEvent?: { contentOffset?: { y?: number }; timestamp?: unknown };
      },
      mode: "single" | "continuous"
    ) => {
      const offsetY = event.nativeEvent?.contentOffset?.y ?? 0;
      trackMobileChromeByOffset(offsetY, `scroll.${mode}`);
      if (!perfEnabled) return;
      const timestampValue = event.nativeEvent?.timestamp;
      const timestamp =
        typeof timestampValue === "number" ? timestampValue : undefined;
      scrollMonitorRef.current.track(timestamp);
    },
    [perfEnabled, trackMobileChromeByOffset]
  );

  const handleWebViewScroll = useCallback(
    (offsetY: number) => {
      trackMobileChromeByOffset(offsetY, "scroll.continuous");
    },
    [trackMobileChromeByOffset]
  );

  const handlePageTap = useCallback(() => {
    const nextVisible = resolvePageTapChromeVisibility({
      chromeVisible: chromeVisibleRef.current,
      selectionActive,
      pinchActive:
        pinchGestureActiveRef.current ||
        (lastPinchEndedAt !== null && Date.now() - lastPinchEndedAt < 400),
      toolActive: activeTool !== "select",
    });
    if (nextVisible !== null) {
      setMobileChromeVisible(nextVisible, "page.tap");
    }
  }, [
    activeTool,
    lastPinchEndedAt,
    selectionActive,
    setMobileChromeVisible,
  ]);

  const handleWebViewTap = useCallback(() => {
    handlePageTap();
  }, [handlePageTap]);

  const keyExtractor = useCallback(
    (item: number | { left: number; right: number | null }) => {
      if (typeof item === "number") return `page-${item}`;
      return `row-${item.left}`;
    },
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: number | { left: number; right: number | null } }) => {
      if (isDouble) {
        const row = item as { left: number; right: number | null };
        return (
          <Animated.View
            style={[
              styles.row,
              { paddingHorizontal: horizontalPadding, width: documentSurfaceWidth },
            ]}
          >
            <View style={{ width: columnWidth }}>
              <PageRenderer
                engine={engine}
                pageIndex={row.left}
                pageAspectRatio={getPageAspectRatio(row.left)}
                availableWidth={columnWidth}
                horizontalPadding={8}
                pageViewportWidth={columnWidth}
                spacing={DOUBLE_PAGE_SPACING}
                onSelectionDragActiveChange={setSelectionDragActive}
                onPageTap={handlePageTap}
                gestureScrollLockActive={gestureScrollLockActive}
                lastPinchEndedAt={lastPinchEndedAt}
                requestSelectionVerticalAutoscroll={
                  handleSelectionVerticalAutoscroll
                }
                onRenderReady={handlePinchRenderReady}
                surfaceId={`page-${row.left}`}
                gestureId={committedPinchGestureIdRef.current ?? undefined}
              />
            </View>
            {row.right !== null ? (
              <View style={{ width: columnWidth }}>
                <PageRenderer
                  engine={engine}
                  pageIndex={row.right}
                  pageAspectRatio={getPageAspectRatio(row.right)}
                  availableWidth={columnWidth}
                  horizontalPadding={8}
                  pageViewportWidth={columnWidth}
                  spacing={DOUBLE_PAGE_SPACING}
                  onSelectionDragActiveChange={setSelectionDragActive}
                  onPageTap={handlePageTap}
                  gestureScrollLockActive={gestureScrollLockActive}
                  lastPinchEndedAt={lastPinchEndedAt}
                requestSelectionVerticalAutoscroll={
                  handleSelectionVerticalAutoscroll
                }
                onRenderReady={handlePinchRenderReady}
                surfaceId={`page-${row.right}`}
                gestureId={committedPinchGestureIdRef.current ?? undefined}
                />
              </View>
            ) : (
              <View style={{ width: columnWidth }} />
            )}
          </Animated.View>
        );
      }

      return (
        <PageRenderer
          engine={engine}
          pageIndex={item as number}
          pageAspectRatio={getPageAspectRatio(item as number)}
          availableWidth={windowWidth}
          pageViewportWidth={documentSurfaceWidth}
          spacing={CONTINUOUS_PAGE_SPACING}
          onSelectionDragActiveChange={setSelectionDragActive}
          onPageTap={handlePageTap}
          gestureScrollLockActive={gestureScrollLockActive}
          lastPinchEndedAt={lastPinchEndedAt}
          requestSelectionVerticalAutoscroll={handleSelectionVerticalAutoscroll}
          onRenderReady={handlePinchRenderReady}
          surfaceId={`page-${item as number}`}
          gestureId={committedPinchGestureIdRef.current ?? undefined}
        />
      );
    },
    [
      columnWidth,
      documentSurfaceWidth,
      engine,
      getPageAspectRatio,
      handlePageTap,
      handlePinchRenderReady,
      handleSelectionVerticalAutoscroll,
      gestureScrollLockActive,
      horizontalPadding,
      isDouble,
      lastPinchEndedAt,
      windowWidth,
    ]
  );

  if (isWebView) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <WebViewViewer
          engine={engine}
          onScrollOffset={handleWebViewScroll}
          onTap={handleWebViewTap}
        />
      </View>
    );
  }

  if (isNativePdfViewer) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <NativePdfDocumentViewer engine={engine} />
      </View>
    );
  }

  if (isSingle) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <GestureDetector gesture={viewerPinchGesture}>
          <Animated.View
            style={[
              styles.gestureSurface,
              {
                transform: [
                  { translateX: pinchPreviewFocalX },
                  { translateY: pinchPreviewFocalY },
                  { scale: pinchPreviewScale },
                  { translateX: pinchPreviewNegativeFocalX },
                  { translateY: pinchPreviewNegativeFocalY },
                ],
              },
            ]}
          >
            <ScrollView
              ref={horizontalScrollRef}
              horizontal
              scrollEnabled={
                !gestureScrollLockActive && documentSurfaceWidth > windowWidth
              }
              showsHorizontalScrollIndicator={false}
              onScroll={(event) => {
                horizontalScrollOffsetRef.current =
                  event.nativeEvent.contentOffset?.x ?? 0;
              }}
              scrollEventThrottle={16}
            >
              <ScrollView
                ref={(node) => {
                  captureViewerFrame(node);
                  listRef.current = node as unknown as FlatList<any>;
                }}
                style={{ width: documentSurfaceWidth }}
                contentContainerStyle={styles.singleContent}
                showsVerticalScrollIndicator={false}
                scrollEnabled={resolvedViewerScrollEnabled}
                onLayout={() =>
                  captureViewerFrame(listRef.current as unknown as ScrollView)
                }
                onContentSizeChange={(_, height) => {
                  viewerContentHeightRef.current = height;
                }}
                onScroll={(event) => handleViewerScroll(event, "single")}
                onScrollBeginDrag={
                  perfEnabled
                    ? () => {
                        scrollMonitorRef.current.begin("single.beginDrag");
                      }
                    : undefined
                }
                onMomentumScrollBegin={
                  perfEnabled
                    ? () => {
                        scrollMonitorRef.current.begin("single.momentumBegin");
                      }
                    : undefined
                }
                onScrollEndDrag={
                  perfEnabled
                    ? () => {
                        scrollMonitorRef.current.end("single.endDrag");
                        sampleMemory("Viewer", "single.endDrag", { pageCount });
                      }
                    : undefined
                }
                onMomentumScrollEnd={
                  perfEnabled
                    ? () => {
                        scrollMonitorRef.current.end("single.momentumEnd");
                        sampleMemory("Viewer", "single.momentumEnd", {
                          pageCount,
                        });
                      }
                    : undefined
                }
                scrollEventThrottle={16}
              >
                <PageRenderer
                  engine={engine}
                  pageIndex={Math.max(0, currentPage - 1)}
                  pageAspectRatio={getPageAspectRatio(
                    Math.max(0, currentPage - 1)
                  )}
                  availableWidth={windowWidth}
                  pageViewportWidth={documentSurfaceWidth}
                  spacing={32}
                  onSelectionDragActiveChange={setSelectionDragActive}
                  onPageTap={handlePageTap}
                  gestureScrollLockActive={gestureScrollLockActive}
                  lastPinchEndedAt={lastPinchEndedAt}
                  requestSelectionVerticalAutoscroll={
                    handleSelectionVerticalAutoscroll
                  }
                  onRenderReady={handlePinchRenderReady}
                  surfaceId={`page-${Math.max(0, currentPage - 1)}`}
                  gestureId={committedPinchGestureIdRef.current ?? undefined}
                />
              </ScrollView>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <GestureDetector gesture={viewerPinchGesture}>
        <Animated.View
          style={[
            styles.gestureSurface,
            {
              transform: [
                { translateX: pinchPreviewFocalX },
                { translateY: pinchPreviewFocalY },
                { scale: pinchPreviewScale },
                { translateX: pinchPreviewNegativeFocalX },
                { translateY: pinchPreviewNegativeFocalY },
              ],
            },
          ]}
        >
          <ScrollView
            ref={horizontalScrollRef}
            horizontal
            scrollEnabled={
              !gestureScrollLockActive && documentSurfaceWidth > windowWidth
            }
            showsHorizontalScrollIndicator={false}
            onScroll={(event) => {
              horizontalScrollOffsetRef.current =
                event.nativeEvent.contentOffset?.x ?? 0;
            }}
            scrollEventThrottle={16}
          >
            <FlatList
              ref={listRef}
              data={isDouble ? rows : pages}
              style={{ width: documentSurfaceWidth }}
              initialNumToRender={FLATLIST_INITIAL_NUM_TO_RENDER}
              windowSize={resolvedWindowSize}
              maxToRenderPerBatch={resolvedMaxToRenderPerBatch}
              updateCellsBatchingPeriod={FLATLIST_UPDATE_CELLS_BATCHING_PERIOD}
              removeClippedSubviews={resolvedRemoveClippedSubviews}
              getItemLayout={getItemLayout}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              renderItem={renderItem}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
              scrollEnabled={resolvedViewerScrollEnabled}
              onLayout={() => captureViewerFrame(listRef.current)}
              onContentSizeChange={(_, height) => {
                viewerContentHeightRef.current = height;
              }}
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                const dataLength = isDouble ? rows.length : pages.length;
                if (index < 0 || index >= dataLength) return;
                const existingTarget = pendingScrollTargetRef.current;
                pendingScrollTargetRef.current = isDouble
                  ? existingTarget?.listIndex === index
                    ? existingTarget
                    : resolveViewerScrollTarget(rows[index]?.left ?? index * 2, true)
                  : resolveViewerScrollTarget(index, false);
                const offset = Math.max(0, getFallbackOffsetForIndex(index));
                listRef.current?.scrollToOffset({ offset, animated: false });

                if (!isDouble) {
                  ensurePageDimensions(index);
                } else {
                  const row = rows[index];
                  if (row) {
                    ensurePageDimensions(row.left);
                    if (row.right !== null) {
                      ensurePageDimensions(row.right);
                    }
                  }
                }

                scheduleScrollRetry("onScrollToIndexFailed");

                if (perfEnabled) {
                  logPerfEvent("Viewer", "scrollToIndexFailed", {
                    index,
                    averageItemLength,
                    fallbackOffset: offset,
                    fallbackSource: "cached-item-layout",
                    itemCount: dataLength,
                    retryAttempt: pendingScrollAttemptsRef.current,
                  });
                }
              }}
              onScroll={(event) => handleViewerScroll(event, "continuous")}
              onScrollBeginDrag={
                perfEnabled
                  ? () => {
                      scrollMonitorRef.current.begin("continuous.beginDrag");
                    }
                  : undefined
              }
              onMomentumScrollBegin={
                perfEnabled
                  ? () => {
                      scrollMonitorRef.current.begin("continuous.momentumBegin");
                    }
                  : undefined
              }
              onScrollEndDrag={
                perfEnabled
                  ? () => {
                      scrollMonitorRef.current.end("continuous.endDrag");
                      sampleMemory("Viewer", "continuous.endDrag", {
                        pageCount,
                      });
                    }
                  : undefined
              }
              onMomentumScrollEnd={
                perfEnabled
                  ? () => {
                      scrollMonitorRef.current.end("continuous.momentumEnd");
                      sampleMemory("Viewer", "continuous.momentumEnd", {
                        pageCount,
                      });
                    }
                  : undefined
              }
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
            />
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#e9ecef",
  },
  containerDark: {
    backgroundColor: "#0f1115",
  },
  gestureSurface: {
    flex: 1,
  },
  listContent: {
    paddingTop: LIST_TOP_PADDING,
    paddingBottom: LIST_BOTTOM_PADDING,
  },
  singleContent: {
    paddingTop: 18,
    paddingBottom: 140,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export default Viewer;
