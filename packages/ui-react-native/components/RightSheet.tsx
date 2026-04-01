import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  findNodeHandle,
  type LayoutChangeEvent,
  type ViewToken,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine, DocumentType, OutlineItem } from "@papyrus-sdk/types";
import { PapyrusPageView } from "@papyrus-sdk/engine-native";
import { getStrings } from "../mobileStrings";

export interface RightSheetProps {
  engine: DocumentEngine;
  documentType: DocumentType;
  thumbsInitialCount?: number;
}

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
    layoutReady,
    pageIndex,
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
          <View style={[styles.thumbFallback, isDark && styles.thumbFallbackDark]}>
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
      {hasChildren
        ? item.children!.map((child, index) => (
            <OutlineNode
              key={`${child.title}-${index}`}
              item={child}
              depth={depth + 1}
              isDark={isDark}
              onSelect={onSelect}
              untitledLabel={untitledLabel}
            />
          ))
        : null}
    </View>
  );
};

const RightSheet: React.FC<RightSheetProps> = ({
  engine,
  documentType,
  thumbsInitialCount,
}) => {
  const {
    activeMobileDestination,
    sidebarRightOpen,
    sidebarRightTab,
    outline,
    annotations,
    uiTheme,
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
    documentType === "pdf" ? "thumbnails" : "summary"
  );
  const isDark = uiTheme === "dark";
  const t = getStrings(locale);
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
  const [visibleThumbnailPages, setVisibleThumbnailPages] = useState<Set<number>>(
    () => new Set()
  );
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
  const showingNotes = sidebarRightTab === "annotations";
  const showingProgress =
    documentType === "text" || activeMobileDestination === "progress";
  const supportsThumbnails = documentType !== "text";
  const navigationTitle = showingProgress
    ? t.progress
    : documentType === "epub" || activeMobileDestination === "contents"
    ? t.contents
    : t.pages;
  const summaryLabel = documentType === "epub" ? t.contents : t.summaryTab;
  const thumbnailLabel = documentType === "epub" ? t.pages : t.pagesTab;

  const closeSheet = useCallback(() => {
    setDocumentState({ sidebarRightOpen: false });
  }, [setDocumentState]);

  const jumpToPage = useCallback(
    (pageIndex: number) => {
      engine.goToPage(pageIndex + 1);
      setDocumentState({ currentPage: pageIndex + 1 });
      triggerScrollToPage(pageIndex);
      closeSheet();
    },
    [closeSheet, engine, setDocumentState, triggerScrollToPage]
  );

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
    if (activeMobileDestination === "pages") {
      setPagesMode("thumbnails");
      return;
    }
    setPagesMode("summary");
  }, [activeMobileDestination, sidebarRightOpen, sidebarRightTab]);

  useEffect(() => {
    if (!sidebarRightOpen || sidebarRightTab !== "pages") return;
    if (pagesMode !== "thumbnails" || !supportsThumbnails) return;
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
    supportsThumbnails,
  ]);

  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i),
    [pageCount]
  );
  const progressEntries = useMemo(
    () =>
      pages.map((pageIndex) => ({
        pageIndex,
        percent:
          pageCount <= 1 ? 100 : Math.round(((pageIndex + 1) / pageCount) * 100),
      })),
    [pageCount, pages]
  );

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
          onPress={() => jumpToPage(item)}
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
      isDark,
      jumpToPage,
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
          <View style={styles.header}>
            <Text style={[styles.sheetTitle, isDark && styles.sheetTitleDark]}>
              {showingNotes ? t.notes : navigationTitle}
            </Text>
            {!showingNotes ? (
              <Text style={[styles.pageStatus, isDark && styles.pageStatusDark]}>
                {showingProgress
                  ? `${Math.round((currentPage / Math.max(pageCount, 1)) * 100)}%`
                  : `${t.page} ${currentPage} / ${pageCount}`}
              </Text>
            ) : null}
          </View>

          {!showingNotes ? (
            <View style={styles.pagesContent}>
              {!showingProgress ? (
                <View style={styles.pageHeader}>
                  <View style={[styles.segmented, isDark && styles.segmentedDark]}>
                    {supportsThumbnails ? (
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
                          {thumbnailLabel}
                        </Text>
                      </Pressable>
                    ) : null}
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
                        {summaryLabel}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {supportsThumbnails && !showingProgress && pagesMode === "thumbnails" ? (
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
              ) : showingProgress ? (
                <ScrollView
                  contentContainerStyle={styles.summaryContent}
                  showsVerticalScrollIndicator={false}
                >
                  {progressEntries.map((entry) => {
                    const isActive = entry.pageIndex + 1 === currentPage;
                    return (
                      <Pressable
                        key={`progress-${entry.pageIndex}`}
                        onPress={() => jumpToPage(entry.pageIndex)}
                        style={[
                          styles.progressRow,
                          isDark && styles.progressRowDark,
                          isActive && { borderColor: accentColor },
                        ]}
                      >
                        <Text
                          style={[
                            styles.progressLabel,
                            isDark && styles.progressLabelDark,
                          ]}
                        >
                          {entry.percent}%
                        </Text>
                        <Text
                          style={[
                            styles.progressMeta,
                            isDark && styles.progressMetaDark,
                          ]}
                        >
                          {t.page} {entry.pageIndex + 1}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.summaryContent}
                  showsVerticalScrollIndicator={false}
                >
                  {outline.length === 0 ? (
                    <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
                      {t.noSummary}
                    </Text>
                  ) : (
                    outline.map((item, index) => (
                      <OutlineNode
                        key={`${item.title}-${index}`}
                        item={item}
                        isDark={isDark}
                        untitledLabel={t.untitled}
                        onSelect={jumpToPage}
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
              {annotations.length === 0 ? (
                <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
                  {t.noAnnotations}
                </Text>
              ) : (
                <View>
                  {annotations.map((ann) => (
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
                          style={[styles.noteDot, { backgroundColor: ann.color }]}
                        />
                        <Text
                          style={[styles.noteTitle, isDark && styles.noteTitleDark]}
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
                  ))}
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
  header: {
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 4,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  sheetTitleDark: {
    color: "#f8fafc",
  },
  pagesContent: {
    paddingHorizontal: 16,
    flex: 1,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
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
  emptyText: {
    marginTop: 16,
    fontSize: 12,
    color: "#6b7280",
  },
  emptyTextDark: {
    color: "#9ca3af",
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
  progressRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressRowDark: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#111827",
  },
  progressLabelDark: {
    color: "#f8fafc",
  },
  progressMeta: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
  },
  progressMetaDark: {
    color: "#94a3b8",
  },
});

export default RightSheet;
