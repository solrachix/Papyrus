import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  findNodeHandle,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { useViewerStore, SearchService } from '../../core/index';
import { DocumentEngine } from '../../types/index';
import { PapyrusPageView } from '../../engine-native/index';

interface RightSheetProps {
  engine: DocumentEngine;
}

const PageThumbnail: React.FC<{
  engine: DocumentEngine;
  pageIndex: number;
  isActive: boolean;
  isDark: boolean;
  zoom: number;
  onPress: () => void;
}> = ({ engine, pageIndex, isActive, isDark, zoom, onPress }) => {
  const viewRef = useRef<any>(null);
  const [layoutReady, setLayoutReady] = useState(false);

  useEffect(() => {
    if (!layoutReady) return;
    const viewTag = findNodeHandle(viewRef.current);
    if (!viewTag) return;
    const renderScale = 1.5 / Math.max(zoom, 0.5);
    void engine.renderPage(pageIndex, viewTag, renderScale);
  }, [engine, pageIndex, layoutReady, zoom]);

  const handleLayout = (event: LayoutChangeEvent) => {
    if (event.nativeEvent.layout.width && event.nativeEvent.layout.height) {
      setLayoutReady(true);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={[styles.thumbCard, isDark && styles.thumbCardDark, isActive && styles.thumbCardActive]}
    >
      <View onLayout={handleLayout} style={styles.thumbFrame}>
        <PapyrusPageView ref={viewRef} style={styles.thumbView} />
      </View>
      <Text style={[styles.thumbLabel, isDark && styles.thumbLabelDark]}>{pageIndex + 1}</Text>
    </Pressable>
  );
};

const RightSheet: React.FC<RightSheetProps> = ({ engine }) => {
  const {
    sidebarRightOpen,
    sidebarRightTab,
    toggleSidebarRight,
    searchResults,
    activeSearchIndex,
    annotations,
    uiTheme,
    setSearch,
    setDocumentState,
    triggerScrollToPage,
    setSelectedAnnotation,
    pageCount,
    currentPage,
    zoom,
  } = useViewerStore();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const searchService = useMemo(() => new SearchService(engine), [engine]);
  const isDark = uiTheme === 'dark';
  const sheetHeight = Math.min(520, Dimensions.get('window').height * 0.6);

  const closeSheet = () => toggleSidebarRight();

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearch('', []);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchService.search(trimmed);
      setSearch(trimmed, results);
    } finally {
      setIsSearching(false);
    }
  };

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i), [pageCount]);

  if (!sidebarRightOpen) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeSheet}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={closeSheet} />
        <View style={[styles.sheet, { height: sheetHeight }, isDark && styles.sheetDark]}>
          <View style={[styles.handle, isDark && styles.handleDark]} />
          <View style={styles.tabs}>
            {['pages', 'search', 'annotations'].map((tab) => (
              <Pressable
                key={tab}
                onPress={() => toggleSidebarRight(tab as 'pages' | 'search' | 'annotations')}
                style={[
                  styles.tabButton,
                  isDark && styles.tabButtonDark,
                  sidebarRightTab === tab && styles.tabButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    isDark && styles.tabTextDark,
                    sidebarRightTab === tab && styles.tabTextActive,
                  ]}
                >
                  {tab === 'pages' ? 'Pages' : tab === 'search' ? 'Search' : 'Notes'}
                </Text>
              </Pressable>
            ))}
          </View>

          {sidebarRightTab === 'pages' ? (
            <View style={styles.pagesContent}>
              <Text style={[styles.pageStatus, isDark && styles.pageStatusDark]}>
                Page {currentPage} / {pageCount}
              </Text>
              <FlatList
                horizontal
                data={pages}
                keyExtractor={(item) => `thumb-${item}`}
                contentContainerStyle={styles.thumbList}
                showsHorizontalScrollIndicator={false}
                initialNumToRender={6}
                windowSize={5}
                renderItem={({ item }) => (
                  <PageThumbnail
                    engine={engine}
                    pageIndex={item}
                    isActive={item + 1 === currentPage}
                    isDark={isDark}
                    zoom={zoom}
                    onPress={() => {
                      engine.goToPage(item + 1);
                      setDocumentState({ currentPage: item + 1 });
                      triggerScrollToPage(item);
                      closeSheet();
                    }}
                  />
                )}
              />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              {sidebarRightTab === 'search' ? (
                <View>
                  <View style={[styles.searchBox, isDark && styles.searchBoxDark]}>
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search text..."
                      placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
                      style={[styles.searchInput, isDark && styles.searchInputDark]}
                      onSubmitEditing={handleSearch}
                      returnKeyType="search"
                    />
                    <Pressable onPress={handleSearch} style={styles.searchButton}>
                      <Text style={styles.searchButtonText}>Go</Text>
                    </Pressable>
                  </View>

                  {isSearching && (
                    <View style={styles.searchStatus}>
                      <ActivityIndicator size="small" color={isDark ? '#60a5fa' : '#2563eb'} />
                      <Text style={[styles.searchStatusText, isDark && styles.searchStatusTextDark]}>
                        Searching...
                      </Text>
                    </View>
                  )}

                {!isSearching && searchResults.length === 0 && (
                  <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
                    No results yet.
                  </Text>
                )}
                {!isSearching && searchResults.length === 0 && query.trim().length >= 2 && Platform.OS === 'android' && (
                  <Text style={[styles.searchHint, isDark && styles.searchHintDark]}>
                    Search on Android is limited until PDF text extraction is upgraded.
                  </Text>
                )}

                  {!isSearching &&
                    searchResults.map((res, idx) => {
                      const isActive = idx === activeSearchIndex;
                      return (
                        <Pressable
                          key={`${res.pageIndex}-${idx}`}
                          onPress={() => {
                            setDocumentState({ activeSearchIndex: idx });
                            triggerScrollToPage(res.pageIndex);
                            closeSheet();
                          }}
                          style={[
                            styles.resultCard,
                            isDark && styles.resultCardDark,
                            isActive && styles.resultCardActive,
                          ]}
                        >
                          <Text style={[styles.resultPage, isDark && styles.resultPageDark]}>
                            Page {res.pageIndex + 1}
                          </Text>
                          <Text
                            style={[
                              styles.resultText,
                              isDark && styles.resultTextDark,
                              isActive && styles.resultTextActive,
                            ]}
                          >
                            ...{res.text}...
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              ) : (
                <View>
                  {annotations.length === 0 ? (
                    <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
                      No annotations yet.
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
                          <View style={[styles.noteDot, { backgroundColor: ann.color }]} />
                          <Text style={[styles.noteTitle, isDark && styles.noteTitleDark]}>
                            Page {ann.pageIndex + 1}
                          </Text>
                        </View>
                        <Text style={[styles.noteType, isDark && styles.noteTypeDark]}>
                          {ann.type.toUpperCase()}
                        </Text>
                        {ann.content ? (
                          <Text style={[styles.noteContent, isDark && styles.noteContentDark]}>
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
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 16,
  },
  sheetDark: {
    backgroundColor: '#0f1115',
    borderTopColor: '#1f2937',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#cbd5f5',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  handleDark: {
    backgroundColor: '#374151',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#f3f4f6',
  },
  tabButtonDark: {
    backgroundColor: '#111827',
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  tabTextDark: {
    color: '#e5e7eb',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  pagesContent: {
    paddingHorizontal: 16,
  },
  pageStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  pageStatusDark: {
    color: '#e5e7eb',
  },
  thumbList: {
    paddingVertical: 8,
  },
  thumbCard: {
    width: 112,
    marginRight: 12,
    padding: 8,
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  thumbCardDark: {
    backgroundColor: '#111827',
    borderColor: '#1f2937',
  },
  thumbCardActive: {
    borderColor: '#2563eb',
  },
  thumbFrame: {
    width: 92,
    height: 128,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  thumbView: {
    width: '100%',
    height: '100%',
  },
  thumbLabel: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  thumbLabelDark: {
    color: '#e5e7eb',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchBoxDark: {
    backgroundColor: '#111827',
    borderColor: '#1f2937',
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#111827',
  },
  searchInputDark: {
    color: '#e5e7eb',
  },
  searchButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#2563eb',
  },
  searchButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  searchStatus: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchStatusText: {
    marginLeft: 8,
    fontSize: 11,
    color: '#4b5563',
  },
  searchStatusTextDark: {
    color: '#9ca3af',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 12,
    color: '#6b7280',
  },
  emptyTextDark: {
    color: '#9ca3af',
  },
  searchHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#6b7280',
  },
  searchHintDark: {
    color: '#9ca3af',
  },
  resultCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  resultCardDark: {
    backgroundColor: '#111827',
    borderColor: '#1f2937',
  },
  resultCardActive: {
    borderColor: '#2563eb',
  },
  resultPage: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563eb',
    marginBottom: 6,
  },
  resultPageDark: {
    color: '#60a5fa',
  },
  resultText: {
    fontSize: 11,
    color: '#374151',
  },
  resultTextDark: {
    color: '#d1d5db',
  },
  resultTextActive: {
    color: '#1d4ed8',
  },
  noteCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  noteCardDark: {
    backgroundColor: '#111827',
    borderColor: '#1f2937',
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: '700',
    color: '#111827',
  },
  noteTitleDark: {
    color: '#e5e7eb',
  },
  noteType: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563eb',
  },
  noteTypeDark: {
    color: '#60a5fa',
  },
  noteContent: {
    marginTop: 6,
    fontSize: 11,
    color: '#4b5563',
  },
  noteContentDark: {
    color: '#9ca3af',
  },
});

export default RightSheet;
