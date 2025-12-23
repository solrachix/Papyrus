import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useViewerStore } from '@papyrus-sdk/core';
import { DocumentEngine } from '@papyrus-sdk/types';
import PageRenderer from './PageRenderer';

interface ViewerProps {
  engine: DocumentEngine;
}

const Viewer: React.FC<ViewerProps> = ({ engine }) => {
  const { pageCount, currentPage, scrollToPageSignal, setDocumentState, uiTheme, viewMode } = useViewerStore();
  const listRef = useRef<FlatList<any>>(null);
  const isDark = uiTheme === 'dark';
  const { width: windowWidth } = useWindowDimensions();
  const isDouble = viewMode === 'double';
  const isSingle = viewMode === 'single';

  const pages = useMemo(() => Array.from({ length: pageCount }).map((_, i) => i), [pageCount]);
  const rows = useMemo(() => {
    if (!isDouble) return [];
    const result: Array<{ left: number; right: number | null }> = [];
    for (let i = 0; i < pageCount; i += 2) {
      result.push({ left: i, right: i + 1 < pageCount ? i + 1 : null });
    }
    return result;
  }, [isDouble, pageCount]);

  useEffect(() => {
    if (scrollToPageSignal === null) return;
    if (pageCount === 0) return;
    if (scrollToPageSignal < 0 || scrollToPageSignal >= pageCount) return;
    if (isSingle) {
      setDocumentState({ currentPage: scrollToPageSignal + 1, scrollToPageSignal: null });
      return;
    }
    const targetIndex = isDouble ? Math.floor(scrollToPageSignal / 2) : scrollToPageSignal;
    listRef.current?.scrollToIndex({ index: targetIndex, animated: true });
    setDocumentState({ scrollToPageSignal: null });
  }, [scrollToPageSignal, pageCount, setDocumentState, isDouble, isSingle]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      const first = viewableItems[0];
      if (!first) return;
      if (isDouble) {
        const item = first.item as { left: number; right: number | null } | undefined;
        if (!item) return;
        const page = item.left + 1;
        if (page !== currentPage) {
          setDocumentState({ currentPage: page });
        }
        return;
      }

      if (first.index !== null && first.index !== undefined) {
        const page = first.index + 1;
        if (page !== currentPage) {
          setDocumentState({ currentPage: page });
        }
      }
    },
    [currentPage, isDouble, setDocumentState]
  );

  if (isSingle) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <ScrollView
          contentContainerStyle={styles.singleContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled
        >
          <PageRenderer engine={engine} pageIndex={Math.max(0, currentPage - 1)} spacing={32} />
        </ScrollView>
      </View>
    );
  }

  const columnGap = 12;
  const horizontalPadding = 16;
  const columnWidth = isDouble
    ? (windowWidth - horizontalPadding * 2 - columnGap) / 2
    : windowWidth;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        ref={listRef}
        data={isDouble ? rows : pages}
        keyExtractor={(item) => (isDouble ? `row-${item.left}` : `page-${item}`)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) =>
          isDouble ? (
            <View style={[styles.row, { paddingHorizontal: horizontalPadding }]}>
              <View style={{ width: columnWidth }}>
                <PageRenderer
                  engine={engine}
                  pageIndex={item.left}
                  availableWidth={columnWidth}
                  horizontalPadding={8}
                  spacing={20}
                />
              </View>
              {item.right !== null ? (
                <View style={{ width: columnWidth }}>
                  <PageRenderer
                    engine={engine}
                    pageIndex={item.right}
                    availableWidth={columnWidth}
                    horizontalPadding={8}
                    spacing={20}
                  />
                </View>
              ) : (
                <View style={{ width: columnWidth }} />
              )}
            </View>
          ) : (
            <PageRenderer engine={engine} pageIndex={item} spacing={28} />
          )
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        scrollEnabled
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          if (index < 0 || index >= pageCount) return;
          const offset = Math.max(0, averageItemLength * index);
          listRef.current?.scrollToOffset({ offset, animated: true });
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e9ecef',
  },
  containerDark: {
    backgroundColor: '#0f1115',
  },
  listContent: {
    paddingTop: 18,
    paddingBottom: 120,
  },
  singleContent: {
    paddingTop: 18,
    paddingBottom: 140,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

export default Viewer;
