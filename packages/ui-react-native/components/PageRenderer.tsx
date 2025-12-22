import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  findNodeHandle,
  useWindowDimensions,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { useViewerStore } from '../../core/index';
import { Annotation, DocumentEngine } from '../../types/index';
import { PapyrusPageView, type PapyrusPageViewProps } from '../../engine-native/index';

interface PageRendererProps {
  engine: DocumentEngine;
  pageIndex: number;
  scale?: number;
  PageViewComponent?: React.ComponentType<PapyrusPageViewProps>;
}

const PageRenderer: React.FC<PageRendererProps> = ({ engine, pageIndex, scale = 1, PageViewComponent = PapyrusPageView }) => {
  const viewRef = useRef<any>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const isAndroid = Platform.OS === 'android';

  const {
    zoom,
    rotation,
    pageTheme,
    annotations,
    activeTool,
    addAnnotation,
    selectedAnnotationId,
    setSelectedAnnotation,
    removeAnnotation,
    searchResults,
    activeSearchIndex,
  } = useViewerStore();

  const pageAnnotations = useMemo(
    () => annotations.filter((ann) => ann.pageIndex === pageIndex),
    [annotations, pageIndex]
  );

  const pageSearchHits = useMemo(
    () =>
      searchResults
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.pageIndex === pageIndex),
    [searchResults, pageIndex]
  );

  useEffect(() => {
    if (!layout.width || !layout.height) return;
    const viewTag = findNodeHandle(viewRef.current);
    if (viewTag) {
      const renderScale = isAndroid ? scale / Math.max(zoom, 0.5) : scale;
      void engine.renderPage(pageIndex, viewTag, renderScale);
    }
  }, [engine, pageIndex, scale, zoom, rotation, layout.width, layout.height, isAndroid]);

  useEffect(() => {
    let active = true;
    const loadDimensions = async () => {
      const dims = await engine.getPageDimensions(pageIndex);
      if (!active) return;
      if (dims.width > 0 && dims.height > 0) {
        setPageSize({ width: dims.width, height: dims.height });
      }
    };
    void loadDimensions();
    return () => {
      active = false;
    };
  }, [engine, pageIndex]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== layout.width || height !== layout.height) {
      setLayout({ width, height });
    }
  };

  const handleLongPress = (event: GestureResponderEvent) => {
    if (activeTool === 'select') return;
    if (!layout.width || !layout.height) return;

    const { locationX, locationY } = event.nativeEvent;
    const normalized = {
      x: locationX / layout.width,
      y: locationY / layout.height,
      width: 0.22,
      height: 0.05,
    };

    addAnnotation({
      id: Math.random().toString(36).slice(2, 9),
      pageIndex,
      type: activeTool as Annotation['type'],
      rect: normalized,
      color: activeTool === 'highlight' ? '#fbbf24' : activeTool === 'strikeout' ? '#ef4444' : '#3b82f6',
      content: activeTool === 'text' || activeTool === 'comment' ? '' : undefined,
      createdAt: Date.now(),
    });
  };

  const handlePress = () => {
    if (activeTool === 'select') {
      setSelectedAnnotation(null);
    }
  };

  const themeOverlayStyle = useMemo(() => {
    switch (pageTheme) {
      case 'sepia':
        return styles.themeSepia;
      case 'dark':
        return styles.themeDark;
      case 'high-contrast':
        return styles.themeContrast;
      default:
        return styles.themeNone;
    }
  }, [pageTheme]);

  const aspectRatio =
    pageSize && pageSize.width > 0 && pageSize.height > 0 ? pageSize.width / pageSize.height : 0.77;
  const baseWidth = windowWidth * 0.92;
  const pageWidth = isAndroid ? baseWidth * zoom : baseWidth;
  const pageHeight = pageWidth / aspectRatio;
  const scrollEnabled = isAndroid && zoom > 1;

  return (
    <ScrollView
      horizontal
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <Pressable
        style={[styles.container, { width: pageWidth, height: pageHeight }]}
        onLayout={handleLayout}
        onPress={handlePress}
        onLongPress={handleLongPress}
      >
        <PageViewComponent ref={viewRef} style={styles.page} />
        <View pointerEvents="none" style={[styles.themeOverlay, themeOverlayStyle]} />
        <View pointerEvents="none" style={styles.searchLayer}>
          {pageSearchHits.map(({ result, index }) => {
            if (!result.rects || result.rects.length === 0) return null;
            return result.rects.map((rect, rectIndex) => {
              if (rect.width <= 0 || rect.height <= 0) return null;
              const isActive = index === activeSearchIndex;
              const highlightStyle = {
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              } as const;
              return (
                <View
                  key={`${index}-${rectIndex}`}
                  style={[
                    styles.searchHighlight,
                    isActive && styles.searchHighlightActive,
                    highlightStyle,
                  ]}
                />
              );
            });
          })}
        </View>
        <View pointerEvents="box-none" style={styles.annotationLayer}>
          {pageAnnotations.map((ann) => {
            const isSelected = selectedAnnotationId === ann.id;
            const style = {
              left: `${ann.rect.x * 100}%`,
              top: `${ann.rect.y * 100}%`,
              width: `${ann.rect.width * 100}%`,
              height: `${ann.rect.height * 100}%`,
              backgroundColor: ann.type === 'highlight' ? `${ann.color}66` : 'transparent',
              borderBottomWidth: ann.type === 'strikeout' ? 2 : 0,
              borderBottomColor: ann.type === 'strikeout' ? ann.color : 'transparent',
            } as const;

            return (
              <Pressable
                key={ann.id}
                onPress={() => setSelectedAnnotation(ann.id)}
                style={[styles.annotation, style, isSelected && styles.annotationSelected]}
              >
                {isSelected && (
                  <Pressable onPress={() => removeAnnotation(ann.id)} style={styles.deleteButton}>
                    <View style={styles.deleteDot} />
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  container: {
    alignSelf: 'center',
    marginBottom: 24,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  page: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  annotationLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  searchLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  searchHighlight: {
    position: 'absolute',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
    borderRadius: 4,
  },
  searchHighlightActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.35)',
    borderColor: '#3b82f6',
  },
  themeOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  themeNone: {
    backgroundColor: 'transparent',
  },
  themeSepia: {
    backgroundColor: 'rgba(244, 236, 216, 0.35)',
  },
  themeDark: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  themeContrast: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  annotation: {
    position: 'absolute',
  },
  annotationSelected: {
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  deleteButton: {
    position: 'absolute',
    right: -8,
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteDot: {
    width: 8,
    height: 2,
    backgroundColor: '#ffffff',
    borderRadius: 2,
  },
});

export default PageRenderer;
