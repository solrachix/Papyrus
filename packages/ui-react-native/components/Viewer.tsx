import React, { useMemo, useRef, useEffect } from 'react';
import { FlatList, StyleSheet, View, type ViewToken } from 'react-native';
import { useViewerStore } from '../../core/index';
import { DocumentEngine } from '../../types/index';
import PageRenderer from './PageRenderer';

interface ViewerProps {
  engine: DocumentEngine;
}

const Viewer: React.FC<ViewerProps> = ({ engine }) => {
  const { pageCount, currentPage, scrollToPageSignal, setDocumentState, uiTheme } = useViewerStore();
  const listRef = useRef<FlatList<number>>(null);
  const isDark = uiTheme === 'dark';

  const pages = useMemo(() => Array.from({ length: pageCount }).map((_, i) => i), [pageCount]);

  useEffect(() => {
    if (scrollToPageSignal === null) return;
    if (pageCount === 0) return;
    if (scrollToPageSignal < 0 || scrollToPageSignal >= pageCount) return;
    listRef.current?.scrollToIndex({ index: scrollToPageSignal, animated: true });
    setDocumentState({ scrollToPageSignal: null });
  }, [scrollToPageSignal, pageCount, setDocumentState]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    const first = viewableItems[0];
    if (first?.index !== undefined && first.index !== null) {
      const page = first.index + 1;
      if (page !== currentPage) {
        setDocumentState({ currentPage: page });
      }
    }
  }).current;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        ref={listRef}
        data={pages}
        keyExtractor={(item) => `page-${item}`}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <PageRenderer engine={engine} pageIndex={item} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
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
    paddingBottom: 36,
  },
});

export default Viewer;
