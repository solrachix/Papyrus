import React, {
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import PageRenderer from "./PageRenderer";
import WebViewViewer from "./WebViewViewer";
import {
  createBurstMonitor,
  createRenderCounter,
  createScrollPerfMonitor,
  isMobilePerfEnabled,
  logPerfEvent,
  perfNow,
  sampleMemory,
} from "../perf/mobilePerf";

export interface ViewerProps {
  engine: DocumentEngine;
  virtualWindowSize?: number;
  maxToRenderPerBatch?: number;
  removeClippedSubviews?: boolean;
}

const LIST_TOP_PADDING = 18;
const LIST_BOTTOM_PADDING = 120;
const CONTINUOUS_PAGE_SPACING = 28;
const DOUBLE_PAGE_SPACING = 20;
const DEFAULT_PAGE_ASPECT_RATIO = 0.77;
const FLATLIST_WINDOW_SIZE = 8;
const FLATLIST_MAX_TO_RENDER_PER_BATCH = 6;
const FLATLIST_UPDATE_CELLS_BATCHING_PERIOD = 40;
const FLATLIST_INITIAL_NUM_TO_RENDER = 6;
const SCROLL_RETRY_DELAY_MS = 120;
const SCROLL_MAX_RETRIES = 10;
const MOBILE_CHROME_HIDE_DELTA = 28;
const MOBILE_CHROME_SHOW_DELTA = 22;
const MOBILE_CHROME_SHOW_DELAY_MS = 180;
const MOBILE_CHROME_TOP_RESET = 16;

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

const Viewer: React.FC<ViewerProps> = ({
  engine,
  virtualWindowSize,
  maxToRenderPerBatch,
  removeClippedSubviews,
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
  const uiTheme = useViewerStore((state) => state.uiTheme);
  const viewMode = useViewerStore((state) => state.viewMode);
  const zoom = useViewerStore((state) => state.zoom);
  const listRef = useRef<FlatList<any>>(null);
  const isDark = uiTheme === "dark";
  const { width: windowWidth } = useWindowDimensions();
  const isDouble = viewMode === "double";
  const isSingle = viewMode === "single";
  const renderTargetType = engine.getRenderTargetType?.() ?? "canvas";
  const isWebView = renderTargetType === "webview";
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
  const pendingScrollIndexRef = useRef<number | null>(null);
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
  const resolvedWindowSize = useMemo(
    () => resolvePositiveInt(virtualWindowSize, FLATLIST_WINDOW_SIZE, 2, 30),
    [virtualWindowSize]
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
    pendingScrollIndexRef.current = null;
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
      const pendingIndex = pendingScrollIndexRef.current;
      if (pendingIndex === null) return;
      if (pendingScrollAttemptsRef.current >= SCROLL_MAX_RETRIES) {
        if (perfEnabled) {
          logPerfEvent("Viewer", "scroll.retry.giveup", {
            reason,
            targetIndex: pendingIndex,
            attempts: pendingScrollAttemptsRef.current,
          });
        }
        clearPendingScrollTarget();
        return;
      }

      clearPendingScrollRetry();
      pendingScrollTimeoutRef.current = setTimeout(() => {
        pendingScrollTimeoutRef.current = null;
        const targetIndex = pendingScrollIndexRef.current;
        if (targetIndex === null) return;
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
      if (isWebView) return;
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
    [clearPendingChromeShow, isWebView, pageCount, setMobileChromeVisible]
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

  const listLayoutMetrics = useMemo(() => {
    const offsets: number[] = [];
    const lengths: number[] = [];
    let offset = LIST_TOP_PADDING;

    if (isDouble) {
      const safeZoom = Math.max(zoom, 0.25);
      const pageWidth = columnWidth * 0.92 * safeZoom;
      const estimatedLength =
        pageWidth / DEFAULT_PAGE_ASPECT_RATIO + DOUBLE_PAGE_SPACING;

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const leftRatio = getPageAspectRatio(row.left);
        const rightRatio =
          row.right === null ? leftRatio : getPageAspectRatio(row.right);
        const leftLength = pageWidth / leftRatio + DOUBLE_PAGE_SPACING;
        const rightLength = pageWidth / rightRatio + DOUBLE_PAGE_SPACING;
        const rowLength = Math.max(leftLength, rightLength);
        offsets.push(offset);
        lengths.push(rowLength);
        offset += rowLength;
      }

      return { offsets, lengths, estimatedLength };
    }

    const safeZoom = Math.max(zoom, 0.25);
    const pageWidth = windowWidth * 0.92 * safeZoom;
    const estimatedLength =
      pageWidth / DEFAULT_PAGE_ASPECT_RATIO + CONTINUOUS_PAGE_SPACING;

    for (let i = 0; i < pageCount; i += 1) {
      const ratio = getPageAspectRatio(i);
      const length = pageWidth / ratio + CONTINUOUS_PAGE_SPACING;
      offsets.push(offset);
      lengths.push(length);
      offset += length;
    }

    return { offsets, lengths, estimatedLength };
  }, [
    columnWidth,
    getPageAspectRatio,
    isDouble,
    layoutRevision,
    pageCount,
    rows,
    windowWidth,
    zoom,
  ]);

  const getFallbackOffsetForIndex = useCallback(
    (index: number) => {
      if (listLayoutMetrics.lengths.length === 0) {
        return LIST_TOP_PADDING;
      }
      const safeIndex = Math.max(
        0,
        Math.min(index, listLayoutMetrics.lengths.length - 1)
      );
      const cachedOffset = listLayoutMetrics.offsets[safeIndex];
      if (typeof cachedOffset === "number") return cachedOffset;
      return LIST_TOP_PADDING + listLayoutMetrics.estimatedLength * safeIndex;
    },
    [listLayoutMetrics]
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => {
      if (listLayoutMetrics.lengths.length === 0) {
        return {
          index,
          length: listLayoutMetrics.estimatedLength,
          offset: LIST_TOP_PADDING,
        };
      }

      const safeIndex = Math.max(
        0,
        Math.min(index, listLayoutMetrics.lengths.length - 1)
      );

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

      const cachedLength = listLayoutMetrics.lengths[safeIndex];
      const cachedOffset = listLayoutMetrics.offsets[safeIndex];

      return {
        index,
        length:
          typeof cachedLength === "number"
            ? cachedLength
            : listLayoutMetrics.estimatedLength,
        offset:
          typeof cachedOffset === "number"
            ? cachedOffset
            : LIST_TOP_PADDING + listLayoutMetrics.estimatedLength * safeIndex,
      };
    },
    [ensurePageDimensions, isDouble, listLayoutMetrics, rows]
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

    const targetIndex = isDouble
      ? Math.floor(scrollToPageSignal / 2)
      : scrollToPageSignal;
    pendingScrollIndexRef.current = targetIndex;
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
      index: targetIndex,
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

      const pendingIndex = pendingScrollIndexRef.current;
      if (pendingIndex !== null) {
        const reachedTarget = viewableItems.some((token) => {
          if (isDouble) {
            const row = token.item as
              | { left: number; right: number | null }
              | undefined;
            if (!row) return false;
            if (row.left === pendingIndex) return true;
            return row.right === pendingIndex;
          }

          return token.index === pendingIndex;
        });

        if (reachedTarget) {
          if (perfEnabled) {
            logPerfEvent("Viewer", "scroll.retry.resolved", {
              targetIndex: pendingIndex,
              attempts: pendingScrollAttemptsRef.current,
            });
          }
          clearPendingScrollTarget();
        }
      }

      const first = viewableItems[0];
      if (!first) return;
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
          <View style={[styles.row, { paddingHorizontal: horizontalPadding }]}>
            <View style={{ width: columnWidth }}>
              <PageRenderer
                engine={engine}
                pageIndex={row.left}
                availableWidth={columnWidth}
                horizontalPadding={8}
                spacing={DOUBLE_PAGE_SPACING}
              />
            </View>
            {row.right !== null ? (
              <View style={{ width: columnWidth }}>
                <PageRenderer
                  engine={engine}
                  pageIndex={row.right}
                  availableWidth={columnWidth}
                  horizontalPadding={8}
                  spacing={DOUBLE_PAGE_SPACING}
                />
              </View>
            ) : (
              <View style={{ width: columnWidth }} />
            )}
          </View>
        );
      }

      return (
        <PageRenderer
          engine={engine}
          pageIndex={item as number}
          spacing={CONTINUOUS_PAGE_SPACING}
        />
      );
    },
    [columnWidth, engine, horizontalPadding, isDouble]
  );

  if (isWebView) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <WebViewViewer engine={engine} />
      </View>
    );
  }

  if (isSingle) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <ScrollView
          contentContainerStyle={styles.singleContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled
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
                  sampleMemory("Viewer", "single.momentumEnd", { pageCount });
                }
              : undefined
          }
          scrollEventThrottle={16}
        >
          <PageRenderer
            engine={engine}
            pageIndex={Math.max(0, currentPage - 1)}
            spacing={32}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        ref={listRef}
        data={isDouble ? rows : pages}
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
        scrollEnabled
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          const dataLength = isDouble ? rows.length : pages.length;
          if (index < 0 || index >= dataLength) return;
          pendingScrollIndexRef.current = index;
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
                sampleMemory("Viewer", "continuous.endDrag", { pageCount });
              }
            : undefined
        }
        onMomentumScrollEnd={
          perfEnabled
            ? () => {
                scrollMonitorRef.current.end("continuous.momentumEnd");
                sampleMemory("Viewer", "continuous.momentumEnd", { pageCount });
              }
            : undefined
        }
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      />
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
