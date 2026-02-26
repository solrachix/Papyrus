import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Platform,
  UIManager,
  findNodeHandle,
  type LayoutChangeEvent,
  type ViewToken,
} from "react-native";
import { useViewerStore, SearchService } from "@papyrus-sdk/core";
import { DocumentEngine, OutlineItem } from "@papyrus-sdk/types";
import { PapyrusPageView } from "@papyrus-sdk/engine-native";
import { getStrings } from "../strings";
import { IconChevronLeft, IconChevronRight } from "../icons";
import {
  createBurstMonitor,
  isMobilePerfEnabled,
  logPerfEvent,
  perfNow,
  sampleMemory,
} from "../perf/mobilePerf";

export interface RightSheetProps {
  engine: DocumentEngine;
  thumbsInitialCount?: number;
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

const THUMBNAILS_INITIAL_NUM_TO_RENDER = 4;
const THUMBNAILS_WINDOW_SIZE = 5;
const THUMBNAILS_MAX_TO_RENDER_PER_BATCH = 6;
const THUMBNAILS_UPDATE_CELLS_BATCHING_PERIOD = 40;
const THUMBNAILS_PREWARM_COUNT = 8;
const THUMBNAILS_DEFAULT_ASPECT_RATIO = 1.28;

const areNumberSetsEqual = (a: Set<number>, b: Set<number>) => {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

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

const PageThumbnail: React.FC<{
  engine: DocumentEngine;
  pageIndex: number;
  isActive: boolean;
  isDark: boolean;
  zoom: number;
  cardWidth: number;
  frameWidth: number;
  frameHeight: number;
  accentColor: string;
  useNativePreview: boolean;
  shouldRenderPreview: boolean;
  onPress: () => void;
}> = ({
  engine,
  pageIndex,
  isActive,
  isDark,
  zoom,
  cardWidth,
  frameWidth,
  frameHeight,
  accentColor,
  useNativePreview,
  shouldRenderPreview,
  onPress,
}) => {
  const viewRef = useRef<any>(null);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    if (!layoutReady || !useNativePreview || !shouldRenderPreview) return;
    const viewTag = findNodeHandle(viewRef.current);
    if (!viewTag) return;
    const isNative = Platform.OS === "android" || Platform.OS === "ios";
    const renderScale = isNative ? 2.0 / Math.max(zoom, 0.5) : 2.0;
    void engine.renderPage(pageIndex, viewTag, renderScale);
  }, [
    engine,
    pageIndex,
    layoutReady,
    shouldRenderPreview,
    useNativePreview,
    zoom,
  ]);

  const handleLayout = (event: LayoutChangeEvent) => {
    if (event.nativeEvent.layout.width && event.nativeEvent.layout.height) {
      setLayoutReady(true);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.thumbCard,
        { width: cardWidth },
        isDark && styles.thumbCardDark,
        isActive && styles.thumbCardActive,
        isActive && { borderColor: accentColor },
      ]}
    >
      <View
        onLayout={handleLayout}
        style={[styles.thumbFrame, { width: frameWidth, height: frameHeight }]}
      >
        {useNativePreview && shouldRenderPreview ? (
          <PapyrusPageView ref={viewRef} style={styles.thumbView} />
        ) : (
          <View
            style={[styles.thumbFallback, isDark && styles.thumbFallbackDark]}
          >
            <Text
              style={[
                styles.thumbFallbackText,
                isDark && styles.thumbFallbackTextDark,
              ]}
            >
              {pageIndex + 1}
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.thumbLabel, isDark && styles.thumbLabelDark]}>
        {pageIndex + 1}
      </Text>
    </Pressable>
  );
};

const OutlineNode: React.FC<{
  item: OutlineItem;
  depth?: number;
  isDark: boolean;
  onSelect: (pageIndex: number) => void;
  untitledLabel: string;
}> = ({ item, depth = 0, isDark, onSelect, untitledLabel }) => {
  const hasChildren = item.children && item.children.length > 0;
  const isClickable = item.pageIndex >= 0;

  return (
    <View>
      <Pressable
        onPress={() => {
          if (isClickable) onSelect(item.pageIndex);
        }}
        style={[styles.outlineRow, { paddingLeft: 12 + depth * 12 }]}
      >
        <Text
          style={[
            styles.outlineText,
            isDark && styles.outlineTextDark,
            !isClickable && styles.outlineTextMuted,
          ]}
          numberOfLines={2}
        >
          {item.title || untitledLabel}
        </Text>
      </Pressable>
      {hasChildren &&
        item.children!.map((child, index) => (
          <OutlineNode
            key={`${child.title}-${index}`}
            item={child}
            depth={depth + 1}
            isDark={isDark}
            onSelect={onSelect}
            untitledLabel={untitledLabel}
          />
        ))}
    </View>
  );
};

const RightSheet: React.FC<RightSheetProps> = ({
  engine,
  thumbsInitialCount,
}) => {
  const {
    sidebarRightOpen,
    sidebarRightTab,
    toggleSidebarRight,
    outline,
    searchResults,
    searchQuery,
    activeSearchIndex,
    nextSearchResult,
    prevSearchResult,
    annotations,
    uiTheme,
    setSearch,
    setDocumentState,
    triggerScrollToPage,
    setSelectedAnnotation,
    pageCount,
    currentPage,
    zoom,
    locale,
    accentColor,
  } = useViewerStore();
  const [pagesMode, setPagesMode] = useState<"thumbnails" | "summary">(
    "thumbnails"
  );
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchService = useMemo(() => new SearchService(engine), [engine]);
  const isDark = uiTheme === "dark";
  const accentSoft = withAlpha(accentColor, 0.2);
  const accentStrong = withAlpha(accentColor, 0.35);
  const t = getStrings(locale);
  const perfEnabled = isMobilePerfEnabled();
  const setStateBurstRef = useRef(
    createBurstMonitor("RightSheet", "setDocumentState", 10, 800)
  );
  const sheetHeight = Math.min(640, Dimensions.get("window").height * 0.72);
  const windowWidth = Dimensions.get("window").width;
  const gridGutter = 12;
  const gridPadding = 16;
  const cardWidth = (windowWidth - gridPadding * 2 - gridGutter) / 2;
  const frameWidth = cardWidth - 16;
  const renderTarget = engine.getRenderTargetType?.();
  const hasNativePageView = Boolean(
    UIManager.getViewManagerConfig?.("PapyrusPageView")
  );
  const useNativePreview = renderTarget !== "webview" && hasNativePageView;
  const thumbnailDimensionsCacheRef = useRef<
    Map<number, { width: number; height: number }>
  >(new Map());
  const thumbnailDimensionsPendingRef = useRef<Set<number>>(new Set());
  const thumbnailRefreshTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [thumbnailLayoutRevision, setThumbnailLayoutRevision] = useState(0);
  const [visibleThumbnailPages, setVisibleThumbnailPages] = useState<
    Set<number>
  >(() => new Set());
  const resolvedThumbsInitialCount = useMemo(
    () =>
      resolvePositiveInt(
        thumbsInitialCount,
        THUMBNAILS_INITIAL_NUM_TO_RENDER,
        2,
        24
      ),
    [thumbsInitialCount]
  );
  const resolvedThumbsPrewarmCount =
    thumbsInitialCount === undefined
      ? THUMBNAILS_PREWARM_COUNT
      : Math.max(resolvedThumbsInitialCount, resolvedThumbsInitialCount * 2);
  const normalizedThumbsInitialCount = Math.min(
    resolvedThumbsInitialCount,
    resolvedThumbsPrewarmCount
  );

  const closeSheet = useCallback(() => {
    toggleSidebarRight();
  }, [toggleSidebarRight]);

  const scheduleThumbnailLayoutRefresh = useCallback(() => {
    if (thumbnailRefreshTimeoutRef.current) return;
    thumbnailRefreshTimeoutRef.current = setTimeout(() => {
      thumbnailRefreshTimeoutRef.current = null;
      setThumbnailLayoutRevision((value) => value + 1);
    }, 80);
  }, []);

  const ensureThumbnailDimensions = useCallback(
    (pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= pageCount) return;
      if (thumbnailDimensionsCacheRef.current.has(pageIndex)) return;
      if (thumbnailDimensionsPendingRef.current.has(pageIndex)) return;

      thumbnailDimensionsPendingRef.current.add(pageIndex);
      void engine
        .getPageDimensions(pageIndex)
        .then((dims) => {
          if (dims.width <= 0 || dims.height <= 0) return;
          thumbnailDimensionsCacheRef.current.set(pageIndex, {
            width: dims.width,
            height: dims.height,
          });
          scheduleThumbnailLayoutRefresh();
        })
        .finally(() => {
          thumbnailDimensionsPendingRef.current.delete(pageIndex);
        });
    },
    [engine, pageCount, scheduleThumbnailLayoutRefresh]
  );

  const getThumbnailFrameHeight = useCallback(
    (pageIndex: number) => {
      const dims = thumbnailDimensionsCacheRef.current.get(pageIndex);
      const ratio =
        !dims || dims.width <= 0 || dims.height <= 0
          ? THUMBNAILS_DEFAULT_ASPECT_RATIO
          : dims.height / dims.width;
      const estimatedHeight = frameWidth * ratio;
      return Math.max(
        frameWidth * 0.9,
        Math.min(frameWidth * 1.7, estimatedHeight)
      );
    },
    [frameWidth, thumbnailLayoutRevision]
  );

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
    if (!perfEnabled || !sidebarRightOpen) return;
    logPerfEvent("RightSheet", "open", {
      tab: sidebarRightTab,
      pageCount,
      currentPage,
      thumbsInitialCount: normalizedThumbsInitialCount,
    });
    sampleMemory("RightSheet", "open", {
      tab: sidebarRightTab,
      pageCount,
    });
  }, [
    currentPage,
    pageCount,
    perfEnabled,
    normalizedThumbsInitialCount,
    sidebarRightOpen,
    sidebarRightTab,
  ]);

  useEffect(() => {
    if (!perfEnabled || !sidebarRightOpen) return;
    return () => {
      logPerfEvent("RightSheet", "close");
    };
  }, [perfEnabled, sidebarRightOpen]);

  useEffect(() => {
    if (
      !perfEnabled ||
      !sidebarRightOpen ||
      sidebarRightTab !== "pages" ||
      pagesMode !== "thumbnails"
    )
      return;
    sampleMemory("RightSheet", "thumbnails.open.start", { pageCount });
    const timeout = setTimeout(() => {
      sampleMemory("RightSheet", "thumbnails.open.steady", { pageCount });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [pageCount, pagesMode, perfEnabled, sidebarRightOpen, sidebarRightTab]);

  useEffect(
    () => () => {
      if (thumbnailRefreshTimeoutRef.current) {
        clearTimeout(thumbnailRefreshTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (sidebarRightOpen) return;
    setVisibleThumbnailPages(new Set());
  }, [sidebarRightOpen]);

  useEffect(() => {
    if (!sidebarRightOpen || sidebarRightTab !== "pages") return;
    if (pagesMode !== "thumbnails") return;
    if (pageCount <= 0) return;

    const initialVisible = new Set<number>();
    const initialCount = Math.min(pageCount, resolvedThumbsPrewarmCount);
    for (let i = 0; i < initialCount; i += 1) {
      initialVisible.add(i);
      ensureThumbnailDimensions(i);
    }

    const currentIndex = Math.max(0, currentPage - 1);
    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(pageCount - 1, currentIndex + 2);
    for (let i = start; i <= end; i += 1) {
      initialVisible.add(i);
      ensureThumbnailDimensions(i);
    }

    setVisibleThumbnailPages((previous) =>
      previous.size === 0 ? initialVisible : previous
    );
  }, [
    currentPage,
    ensureThumbnailDimensions,
    pageCount,
    pagesMode,
    resolvedThumbsPrewarmCount,
    sidebarRightOpen,
    sidebarRightTab,
  ]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearch("", []);
      return;
    }
    const startedAt = perfEnabled ? perfNow() : 0;
    setIsSearching(true);
    try {
      const results = await searchService.search(trimmed);
      setSearch(trimmed, results);
      if (perfEnabled) {
        logPerfEvent("RightSheet", "search.completed", {
          queryLength: trimmed.length,
          results: results.length,
          durationMs: Math.round((perfNow() - startedAt) * 100) / 100,
        });
      }
    } finally {
      setIsSearching(false);
    }
  };

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i),
    [pageCount]
  );

  const renderHighlightedSnippet = (text: string, isActive: boolean) => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      return (
        <Text
          style={[
            styles.resultText,
            isDark && styles.resultTextDark,
            isActive && styles.resultTextActive,
            isActive && { color: accentColor },
          ]}
        >
          ...{text}...
        </Text>
      );
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = trimmedQuery.toLowerCase();
    const parts: Array<{ text: string; match: boolean }> = [];
    let cursor = 0;

    while (cursor < text.length) {
      const index = lowerText.indexOf(lowerQuery, cursor);
      if (index === -1) {
        parts.push({ text: text.slice(cursor), match: false });
        break;
      }
      if (index > cursor) {
        parts.push({ text: text.slice(cursor, index), match: false });
      }
      parts.push({
        text: text.slice(index, index + trimmedQuery.length),
        match: true,
      });
      cursor = index + trimmedQuery.length;
    }

    return (
      <Text
        style={[
          styles.resultText,
          isDark && styles.resultTextDark,
          isActive && styles.resultTextActive,
          isActive && { color: accentColor },
        ]}
      >
        {parts.map((part, idx) => (
          <Text
            key={`${idx}-${part.text}`}
            style={[
              part.match && styles.matchText,
              part.match && isDark && styles.matchTextDark,
              part.match && isActive && styles.matchTextActive,
              part.match &&
                isActive && {
                  backgroundColor: accentStrong,
                  color: accentColor,
                },
            ]}
          >
            {part.text}
          </Text>
        ))}
      </Text>
    );
  };

  const onThumbnailsViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      const nextVisible = new Set<number>();
      viewableItems.forEach((token) => {
        if (typeof token.item !== "number") return;
        const pageIndex = token.item;
        nextVisible.add(pageIndex);
        ensureThumbnailDimensions(pageIndex);
        ensureThumbnailDimensions(pageIndex - 1);
        ensureThumbnailDimensions(pageIndex + 1);
      });

      setVisibleThumbnailPages((previous) =>
        areNumberSetsEqual(previous, nextVisible) ? previous : nextVisible
      );
    },
    [ensureThumbnailDimensions]
  );

  const handleThumbnailPress = useCallback(
    (pageIndex: number) => {
      engine.goToPage(pageIndex + 1);
      setDocumentStateTracked(
        { currentPage: pageIndex + 1 },
        "thumbnail.press"
      );
      triggerScrollToPage(pageIndex);
      closeSheet();
    },
    [closeSheet, engine, setDocumentStateTracked, triggerScrollToPage]
  );

  const renderThumbnailItem = useCallback(
    ({ item }: { item: number }) => {
      const shouldRenderPreview =
        useNativePreview &&
        (visibleThumbnailPages.has(item) ||
          item < resolvedThumbsPrewarmCount ||
          Math.abs(item + 1 - currentPage) <= 1);
      return (
        <PageThumbnail
          engine={engine}
          pageIndex={item}
          isActive={item + 1 === currentPage}
          isDark={isDark}
          zoom={zoom}
          cardWidth={cardWidth}
          frameWidth={frameWidth}
          frameHeight={getThumbnailFrameHeight(item)}
          accentColor={accentColor}
          useNativePreview={useNativePreview}
          shouldRenderPreview={shouldRenderPreview}
          onPress={() => handleThumbnailPress(item)}
        />
      );
    },
    [
      accentColor,
      cardWidth,
      currentPage,
      engine,
      frameWidth,
      getThumbnailFrameHeight,
      handleThumbnailPress,
      isDark,
      resolvedThumbsPrewarmCount,
      useNativePreview,
      visibleThumbnailPages,
      zoom,
    ]
  );

  if (!sidebarRightOpen) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={closeSheet}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <View
          style={[
            styles.sheet,
            { height: sheetHeight },
            isDark && styles.sheetDark,
          ]}
        >
          <View style={[styles.handle, isDark && styles.handleDark]} />
          <View style={styles.tabs}>
            {["pages", "search", "annotations"].map((tab) => (
              <Pressable
                key={tab}
                onPress={() =>
                  toggleSidebarRight(tab as "pages" | "search" | "annotations")
                }
                style={[
                  styles.tabButton,
                  isDark && styles.tabButtonDark,
                  sidebarRightTab === tab && styles.tabButtonActive,
                  sidebarRightTab === tab && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    isDark && styles.tabTextDark,
                    sidebarRightTab === tab && styles.tabTextActive,
                  ]}
                >
                  {tab === "pages"
                    ? t.pages
                    : tab === "search"
                    ? t.search
                    : t.notes}
                </Text>
              </Pressable>
            ))}
          </View>

          {sidebarRightTab === "pages" ? (
            <View style={styles.pagesContent}>
              <View style={styles.pageHeader}>
                <Text
                  style={[styles.pageStatus, isDark && styles.pageStatusDark]}
                >
                  {t.page} {currentPage} / {pageCount}
                </Text>
                <View
                  style={[styles.segmented, isDark && styles.segmentedDark]}
                >
                  <Pressable
                    onPress={() => setPagesMode("thumbnails")}
                    style={[
                      styles.segmentButton,
                      pagesMode === "thumbnails" && styles.segmentButtonActive,
                      pagesMode === "thumbnails" && {
                        backgroundColor: accentColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        isDark && styles.segmentTextDark,
                        pagesMode === "thumbnails" && styles.segmentTextActive,
                      ]}
                    >
                      {t.pagesTab}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPagesMode("summary")}
                    style={[
                      styles.segmentButton,
                      pagesMode === "summary" && styles.segmentButtonActive,
                      pagesMode === "summary" && {
                        backgroundColor: accentColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        isDark && styles.segmentTextDark,
                        pagesMode === "summary" && styles.segmentTextActive,
                      ]}
                    >
                      {t.summaryTab}
                    </Text>
                  </Pressable>
                </View>
              </View>
              {pagesMode === "thumbnails" ? (
                <FlatList
                  data={pages}
                  keyExtractor={(item) => `thumb-${item}`}
                  numColumns={2}
                  contentContainerStyle={styles.thumbGrid}
                  columnWrapperStyle={styles.thumbRow}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={normalizedThumbsInitialCount}
                  windowSize={THUMBNAILS_WINDOW_SIZE}
                  maxToRenderPerBatch={THUMBNAILS_MAX_TO_RENDER_PER_BATCH}
                  updateCellsBatchingPeriod={
                    THUMBNAILS_UPDATE_CELLS_BATCHING_PERIOD
                  }
                  removeClippedSubviews
                  viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
                  onViewableItemsChanged={onThumbnailsViewableItemsChanged}
                  renderItem={renderThumbnailItem}
                />
              ) : (
                <ScrollView
                  contentContainerStyle={styles.summaryContent}
                  showsVerticalScrollIndicator={false}
                >
                  {outline.length === 0 ? (
                    <Text
                      style={[styles.emptyText, isDark && styles.emptyTextDark]}
                    >
                      {t.noSummary}
                    </Text>
                  ) : (
                    outline.map((item, index) => (
                      <OutlineNode
                        key={`${item.title}-${index}`}
                        item={item}
                        isDark={isDark}
                        untitledLabel={t.untitled}
                        onSelect={(pageIndex) => {
                          engine.goToPage(pageIndex + 1);
                          setDocumentStateTracked(
                            { currentPage: pageIndex + 1 },
                            "outline.select"
                          );
                          triggerScrollToPage(pageIndex);
                          closeSheet();
                        }}
                      />
                    ))
                  )}
                </ScrollView>
              )}
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {sidebarRightTab === "search" ? (
                <View>
                  <View
                    style={[styles.searchBox, isDark && styles.searchBoxDark]}
                  >
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder={t.searchPlaceholder}
                      placeholderTextColor={isDark ? "#9ca3af" : "#6b7280"}
                      style={[
                        styles.searchInput,
                        isDark && styles.searchInputDark,
                      ]}
                      onSubmitEditing={handleSearch}
                      returnKeyType="search"
                    />
                    <Pressable
                      onPress={handleSearch}
                      style={[
                        styles.searchButton,
                        { backgroundColor: accentColor },
                      ]}
                    >
                      <Text style={styles.searchButtonText}>{t.searchGo}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.searchMeta}>
                    <Text
                      style={[
                        styles.searchCount,
                        isDark && styles.searchCountDark,
                        { color: accentColor },
                      ]}
                    >
                      {searchResults.length} {t.results}
                    </Text>
                    <View style={styles.searchNav}>
                      <Pressable
                        onPress={prevSearchResult}
                        disabled={searchResults.length === 0}
                        style={[
                          styles.searchNavButton,
                          isDark && styles.searchNavButtonDark,
                          searchResults.length === 0 &&
                            styles.searchNavButtonDisabled,
                        ]}
                      >
                        <IconChevronLeft
                          size={14}
                          color={isDark ? "#e5e7eb" : "#111827"}
                        />
                      </Pressable>
                      <Pressable
                        onPress={nextSearchResult}
                        disabled={searchResults.length === 0}
                        style={[
                          styles.searchNavButton,
                          isDark && styles.searchNavButtonDark,
                          searchResults.length === 0 &&
                            styles.searchNavButtonDisabled,
                        ]}
                      >
                        <IconChevronRight
                          size={14}
                          color={isDark ? "#e5e7eb" : "#111827"}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {isSearching && (
                    <View style={styles.searchStatus}>
                      <ActivityIndicator size="small" color={accentColor} />
                      <Text
                        style={[
                          styles.searchStatusText,
                          isDark && styles.searchStatusTextDark,
                        ]}
                      >
                        {t.searching}
                      </Text>
                    </View>
                  )}

                  {!isSearching && searchResults.length === 0 && (
                    <Text
                      style={[styles.emptyText, isDark && styles.emptyTextDark]}
                    >
                      {t.noResults}
                    </Text>
                  )}

                  {!isSearching &&
                    searchResults.map((res, idx) => {
                      const isActive = idx === activeSearchIndex;
                      return (
                        <Pressable
                          key={`${res.pageIndex}-${idx}`}
                          onPress={() => {
                            setDocumentStateTracked(
                              { activeSearchIndex: idx },
                              "searchResult.select"
                            );
                            triggerScrollToPage(res.pageIndex);
                            closeSheet();
                          }}
                          style={[
                            styles.resultCard,
                            isDark && styles.resultCardDark,
                            isActive && styles.resultCardActive,
                            isActive && { borderColor: accentColor },
                          ]}
                        >
                          <Text
                            style={[
                              styles.resultPage,
                              isDark && styles.resultPageDark,
                              { color: accentColor },
                            ]}
                          >
                            {t.page} {res.pageIndex + 1}
                          </Text>
                          {renderHighlightedSnippet(res.text, isActive)}
                        </Pressable>
                      );
                    })}
                </View>
              ) : (
                <View>
                  {annotations.length === 0 ? (
                    <Text
                      style={[styles.emptyText, isDark && styles.emptyTextDark]}
                    >
                      {t.noAnnotations}
                    </Text>
                  ) : (
                    annotations.map((ann) => (
                      <Pressable
                        key={ann.id}
                        onPress={() => {
                          setSelectedAnnotation(ann.id);
                          triggerScrollToPage(ann.pageIndex);
                          closeSheet();
                        }}
                        style={[styles.noteCard, isDark && styles.noteCardDark]}
                      >
                        <View style={styles.noteHeader}>
                          <View
                            style={[
                              styles.noteDot,
                              { backgroundColor: ann.color },
                            ]}
                          />
                          <Text
                            style={[
                              styles.noteTitle,
                              isDark && styles.noteTitleDark,
                            ]}
                          >
                            {t.page} {ann.pageIndex + 1}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.noteType,
                            isDark && styles.noteTypeDark,
                            { color: accentColor },
                          ]}
                        >
                          {ann.type === "comment" || ann.type === "text"
                            ? t.note.toUpperCase()
                            : ann.type.toUpperCase()}
                        </Text>
                        {ann.content ? (
                          <Text
                            style={[
                              styles.noteContent,
                              isDark && styles.noteContentDark,
                            ]}
                          >
                            {ann.content}
                          </Text>
                        ) : null}
                      </Pressable>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingBottom: 16,
  },
  sheetDark: {
    backgroundColor: "#0f1115",
    borderTopColor: "#1f2937",
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#cbd5f5",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 12,
  },
  handleDark: {
    backgroundColor: "#374151",
  },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: "#e5e7eb",
  },
  tabButtonDark: {
    backgroundColor: "#111827",
  },
  tabButtonActive: {
    backgroundColor: "#2563eb",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  tabTextDark: {
    color: "#e5e7eb",
  },
  tabTextActive: {
    color: "#ffffff",
  },
  pagesContent: {
    paddingHorizontal: 16,
    flex: 1,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pageStatus: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  pageStatusDark: {
    color: "#e5e7eb",
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#e5e7eb",
    borderRadius: 999,
    padding: 2,
  },
  segmentedDark: {
    backgroundColor: "#111827",
  },
  segmentButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  segmentButtonActive: {
    backgroundColor: "#2563eb",
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  segmentTextDark: {
    color: "#e5e7eb",
  },
  segmentTextActive: {
    color: "#ffffff",
  },
  thumbGrid: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  thumbRow: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  thumbCard: {
    padding: 8,
    borderRadius: 14,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  thumbCardDark: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
  },
  thumbCardActive: {
    borderColor: "#2563eb",
  },
  thumbFrame: {
    borderRadius: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  thumbView: {
    width: "100%",
    height: "100%",
  },
  thumbFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  thumbFallbackDark: {
    backgroundColor: "#0b0f14",
  },
  thumbFallbackText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1f2937",
  },
  thumbFallbackTextDark: {
    color: "#e5e7eb",
  },
  thumbLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  thumbLabelDark: {
    color: "#e5e7eb",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  summaryContent: {
    paddingBottom: 24,
  },
  outlineRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148, 163, 184, 0.18)",
  },
  outlineText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  outlineTextDark: {
    color: "#e5e7eb",
  },
  outlineTextMuted: {
    color: "#9ca3af",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  searchBoxDark: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: "#111827",
  },
  searchInputDark: {
    color: "#e5e7eb",
  },
  searchButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#2563eb",
  },
  searchButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
  searchStatus: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  searchStatusText: {
    marginLeft: 8,
    fontSize: 11,
    color: "#4b5563",
  },
  searchStatusTextDark: {
    color: "#9ca3af",
  },
  searchMeta: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchCount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
  },
  searchCountDark: {
    color: "#60a5fa",
  },
  searchNav: {
    flexDirection: "row",
    alignItems: "center",
  },
  searchNavButton: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  searchNavButtonDark: {
    backgroundColor: "#111827",
  },
  searchNavButtonDisabled: {
    opacity: 0.5,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 12,
    color: "#6b7280",
  },
  emptyTextDark: {
    color: "#9ca3af",
  },
  resultCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  resultCardDark: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
  },
  resultCardActive: {
    borderColor: "#2563eb",
  },
  resultPage: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2563eb",
    marginBottom: 6,
  },
  resultPageDark: {
    color: "#60a5fa",
  },
  resultText: {
    fontSize: 11,
    color: "#374151",
  },
  resultTextDark: {
    color: "#d1d5db",
  },
  resultTextActive: {
    color: "#1d4ed8",
  },
  matchText: {
    backgroundColor: "rgba(245, 158, 11, 0.3)",
    color: "#111827",
    fontWeight: "700",
  },
  matchTextDark: {
    backgroundColor: "rgba(245, 158, 11, 0.25)",
    color: "#fde68a",
  },
  matchTextActive: {
    backgroundColor: "rgba(59, 130, 246, 0.35)",
    color: "#1d4ed8",
  },
  noteCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  noteCardDark: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  noteTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  noteTitleDark: {
    color: "#e5e7eb",
  },
  noteType: {
    fontSize: 10,
    fontWeight: "800",
    color: "#2563eb",
  },
  noteTypeDark: {
    color: "#60a5fa",
  },
  noteContent: {
    marginTop: 6,
    fontSize: 11,
    color: "#4b5563",
  },
  noteContentDark: {
    color: "#9ca3af",
  },
});

export default RightSheet;
