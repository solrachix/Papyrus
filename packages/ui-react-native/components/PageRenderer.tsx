import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  PanResponder,
  Platform,
  findNodeHandle,
  useWindowDimensions,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from 'react-native';
import { useViewerStore } from '@papyrus-sdk/core';
import { Annotation, DocumentEngine, TextSelection } from '@papyrus-sdk/types';
import { PapyrusPageView, type PapyrusPageViewProps } from '@papyrus-sdk/engine-native';

type PageViewComponentType = React.ComponentType<PapyrusPageViewProps & React.RefAttributes<any>>;

interface PageRendererProps {
  engine: DocumentEngine;
  pageIndex: number;
  scale?: number;
  PageViewComponent?: PageViewComponentType;
  availableWidth?: number;
  horizontalPadding?: number;
  spacing?: number;
}

const PageRenderer: React.FC<PageRendererProps> = ({
  engine,
  pageIndex,
  scale = 1,
  PageViewComponent = PapyrusPageView as PageViewComponentType,
  availableWidth,
  horizontalPadding = 16,
  spacing = 24,
}) => {
  const viewRef = useRef<any>(null);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const isAndroid = Platform.OS === 'android';
  const isNative = Platform.OS === 'android' || Platform.OS === 'ios';

  const {
    zoom,
    rotation,
    pageTheme,
    annotations,
    annotationColor,
    addAnnotation,
    setDocumentState,
    accentColor,
    selectedAnnotationId,
    setSelectedAnnotation,
    removeAnnotation,
    searchResults,
    activeSearchIndex,
    setSelectionActive,
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

  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectionRects, setSelectionRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>([]);
  const [selectionBounds, setSelectionBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [selectionText, setSelectionText] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionStart = useRef<{ x: number; y: number } | null>(null);
  const selectionRectRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const selectionBoundsRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const selectionBoundsStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

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

  const addAnnotationAt = (x: number, y: number, width: number, height: number, type: Annotation['type']) => {
    addAnnotation({
      id: Math.random().toString(36).slice(2, 9),
      pageIndex,
      type,
      rect: { x, y, width, height },
      color: annotationColor,
      content: type === 'text' || type === 'comment' ? '' : undefined,
      createdAt: Date.now(),
    });
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const getBoundsFromRects = (rects: Array<{ x: number; y: number; width: number; height: number }>) => {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    rects.forEach((rect) => {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    });
    if (maxX <= minX || maxY <= minY) return null;
    return {
      x: clamp(minX, 0, 1),
      y: clamp(minY, 0, 1),
      width: clamp(maxX - minX, 0, 1),
      height: clamp(maxY - minY, 0, 1),
    };
  };

  const clearSelection = () => {
    setSelectionRect(null);
    selectionRectRef.current = null;
    setSelectionRects([]);
    setSelectionBounds(null);
    selectionBoundsRef.current = null;
    setSelectionText('');
    setIsSelecting(false);
    selectionStart.current = null;
    selectionBoundsStart.current = null;
    setSelectionActive(false);
  };

  const applySelectionResult = (selection: TextSelection | null) => {
    if (!selection || !selection.rects || selection.rects.length === 0) {
      clearSelection();
      return;
    }
    setSelectionRects(selection.rects);
    setSelectionText(selection.text || '');
    const bounds = getBoundsFromRects(selection.rects);
    if (!bounds) {
      clearSelection();
      return;
    }
    setSelectionBounds(bounds);
    selectionBoundsRef.current = bounds;
    setSelectionActive(true);
  };

  const selectFromBounds = async (bounds: { x: number; y: number; width: number; height: number }) => {
    const selection = await engine.selectText?.(pageIndex, bounds);
    applySelectionResult(selection ?? null);
  };

  const selectAtPoint = async (x: number, y: number) => {
    if (!layout.width || !layout.height) return;
    const size = 26;
    const half = size / 2;
    const left = clamp(x - half, 0, Math.max(0, layout.width - size));
    const top = clamp(y - half, 0, Math.max(0, layout.height - size));
    const bounds = {
      x: left / layout.width,
      y: top / layout.height,
      width: size / layout.width,
      height: size / layout.height,
    };
    await selectFromBounds(bounds);
  };

  const getTouchDistance = (touches: Array<{ pageX: number; pageY: number }>) => {
    if (touches.length < 2) return 0;
    const [a, b] = touches;
    return Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
  };

  const shouldHandlePinch = (touches: Array<{ pageX: number; pageY: number }>) => isNative && touches.length === 2;

  const handlePinchStart = (touches: Array<{ pageX: number; pageY: number }>) => {
    if (!shouldHandlePinch(touches)) return;
    pinchRef.current = { distance: getTouchDistance(touches), zoom };
  };

  const handlePinchMove = (touches: Array<{ pageX: number; pageY: number }>) => {
    if (!shouldHandlePinch(touches) || !pinchRef.current) return;
    const distance = getTouchDistance(touches);
    if (!distance) return;
    const scale = distance / pinchRef.current.distance;
    const nextZoom = clamp(pinchRef.current.zoom * scale, 0.5, 4.0);
    setDocumentState({ zoom: nextZoom });
    engine.setZoom(nextZoom);
  };

  const handlePinchEnd = () => {
    pinchRef.current = null;
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!layout.width || !layout.height) return;
    if (selectionRects.length > 0 || selectionBounds) {
      clearSelection();
      return;
    }
    setSelectedAnnotation(null);
    if (!isNative) return;

    const { locationX, locationY } = event.nativeEvent;
    const now = Date.now();
    const lastTap = lastTapRef.current;
    lastTapRef.current = { time: now, x: locationX, y: locationY };

    if (!lastTap) return;
    const timeDelta = now - lastTap.time;
    const distance = Math.hypot(locationX - lastTap.x, locationY - lastTap.y);
    if (timeDelta < 280 && distance < 24) {
      void selectAtPoint(locationX, locationY);
    }
  };

  const selectionEnabled = Platform.OS === 'web';
  void selectionText;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => selectionEnabled,
        onMoveShouldSetPanResponder: () => selectionEnabled,
        onPanResponderGrant: (event) => {
          if (!selectionEnabled || !layout.width || !layout.height) return;
          const { locationX, locationY } = event.nativeEvent;
          selectionStart.current = { x: locationX, y: locationY };
          setIsSelecting(true);
          const rect = { x: locationX, y: locationY, width: 0, height: 0 };
          selectionRectRef.current = rect;
          setSelectionRect(rect);
        },
        onPanResponderMove: (_, gestureState) => {
          if (!selectionEnabled || !selectionStart.current) return;
          const start = selectionStart.current;
          const currentX = start.x + gestureState.dx;
          const currentY = start.y + gestureState.dy;
          const left = Math.max(0, Math.min(start.x, currentX));
          const top = Math.max(0, Math.min(start.y, currentY));
          const right = Math.min(layout.width, Math.max(start.x, currentX));
          const bottom = Math.min(layout.height, Math.max(start.y, currentY));
          const rect = { x: left, y: top, width: right - left, height: bottom - top };
          selectionRectRef.current = rect;
          setSelectionRect(rect);
        },
        onPanResponderRelease: async () => {
          const rect = selectionRectRef.current;
          if (!selectionEnabled || !rect || !layout.width || !layout.height) {
            setIsSelecting(false);
            selectionStart.current = null;
            return;
          }
          setIsSelecting(false);
          selectionStart.current = null;

          const minSize = 6;
          if (rect.width < minSize || rect.height < minSize) {
            clearSelection();
            return;
          }

          const normalized = {
            x: rect.x / layout.width,
            y: rect.y / layout.height,
            width: rect.width / layout.width,
            height: rect.height / layout.height,
          };

          await selectFromBounds(normalized);
          setSelectionRect(null);
        },
      }),
    [selectionEnabled, layout.width, layout.height, engine, pageIndex]
  );

  const selectionBoundsPx = useMemo(() => {
    if (!selectionBounds || !layout.width || !layout.height) return null;
    return {
      x: selectionBounds.x * layout.width,
      y: selectionBounds.y * layout.height,
      width: selectionBounds.width * layout.width,
      height: selectionBounds.height * layout.height,
    };
  }, [selectionBounds, layout.width, layout.height]);

  const createHandleResponder = (handle: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        selectionBoundsStart.current = selectionBoundsRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const start = selectionBoundsStart.current;
        if (!start || !layout.width || !layout.height) return;
        const dx = gestureState.dx / layout.width;
        const dy = gestureState.dy / layout.height;
        const minSize = 0.01;
        let next = { ...start };

        if (handle === 'start') {
          const newX = clamp(start.x + dx, 0, start.x + start.width - minSize);
          const newY = clamp(start.y + dy, 0, start.y + start.height - minSize);
          next = {
            x: newX,
            y: newY,
            width: start.x + start.width - newX,
            height: start.y + start.height - newY,
          };
        } else {
          const maxX = clamp(start.x + start.width + dx, start.x + minSize, 1);
          const maxY = clamp(start.y + start.height + dy, start.y + minSize, 1);
          next = {
            x: start.x,
            y: start.y,
            width: maxX - start.x,
            height: maxY - start.y,
          };
        }

        selectionBoundsRef.current = next;
        setSelectionBounds(next);
      },
      onPanResponderRelease: async () => {
        const next = selectionBoundsRef.current;
        selectionBoundsStart.current = null;
        if (!next) return;
        await selectFromBounds(next);
      },
      onPanResponderTerminate: () => {
        selectionBoundsStart.current = null;
      },
    });

  const startHandleResponder = useMemo(
    () => createHandleResponder('start'),
    [layout.width, layout.height, engine, pageIndex]
  );

  const endHandleResponder = useMemo(
    () => createHandleResponder('end'),
    [layout.width, layout.height, engine, pageIndex]
  );

  const applySelection = (type: 'highlight' | 'strikeout' | 'comment') => {
    if (selectionRects.length === 0) return;

    if (type === 'comment') {
      const first = selectionRects[0];
      addAnnotationAt(first.x, first.y, Math.max(0.08, first.width), Math.max(0.06, first.height), 'comment');
      clearSelection();
      return;
    }

    selectionRects.forEach((rect) => {
      addAnnotationAt(rect.x, rect.y, rect.width, rect.height, type);
    });
    clearSelection();
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
  const containerWidth = availableWidth ?? windowWidth;
  const baseWidth = containerWidth * 0.92;
  const pageWidth = isAndroid ? baseWidth * zoom : baseWidth;
  const pageHeight = pageWidth / aspectRatio;
  const scrollEnabled = isAndroid && zoom > 1;

  return (
    <ScrollView
      horizontal
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
    >
      <Pressable
        {...panResponder.panHandlers}
        style={[styles.container, { width: pageWidth, height: pageHeight, marginBottom: spacing }]}
        onLayout={handleLayout}
        onPress={handlePress}
        onStartShouldSetResponder={(event) => shouldHandlePinch(event.nativeEvent.touches)}
        onMoveShouldSetResponder={(event) => shouldHandlePinch(event.nativeEvent.touches)}
        onResponderGrant={(event) => handlePinchStart(event.nativeEvent.touches)}
        onResponderMove={(event) => handlePinchMove(event.nativeEvent.touches)}
        onResponderRelease={handlePinchEnd}
        onResponderTerminate={handlePinchEnd}
      >
        <PageViewComponent ref={viewRef} style={styles.page} />
        <View pointerEvents="none" style={[styles.themeOverlay, themeOverlayStyle]} />
        <View pointerEvents="box-none" style={styles.selectionLayer}>
          <View pointerEvents="none">
            {selectionRects.map((rect, index) => {
              const style = {
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              } as const;
              return <View key={`sel-${index}`} style={[styles.selectionHighlight, style]} />;
            })}
          </View>
          {selectionBoundsPx ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.selectionOutline,
                {
                  left: selectionBoundsPx.x,
                  top: selectionBoundsPx.y,
                  width: selectionBoundsPx.width,
                  height: selectionBoundsPx.height,
                  borderColor: accentColor,
                },
              ]}
            >
              <View
                {...startHandleResponder.panHandlers}
                style={[styles.selectionHandle, { left: -8, top: -8, borderColor: accentColor }]}
              />
              <View
                {...endHandleResponder.panHandlers}
                style={[styles.selectionHandle, { right: -8, bottom: -8, borderColor: accentColor }]}
              />
            </View>
          ) : null}
          {isSelecting && selectionRect ? (
            <View
              pointerEvents="none"
              style={[
                styles.selectionOutline,
                {
                  left: selectionRect.x,
                  top: selectionRect.y,
                  width: selectionRect.width,
                  height: selectionRect.height,
                  borderColor: accentColor,
                },
              ]}
            />
          ) : null}
        </View>
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
                    { borderColor: accentColor, backgroundColor: `${accentColor}26` },
                    isActive && styles.searchHighlightActive,
                    isActive && { borderColor: accentColor, backgroundColor: `${accentColor}40` },
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
              borderBottomWidth: ann.type === 'strikeout' ? 3 : 0,
              borderBottomColor: ann.type === 'strikeout' ? ann.color : 'transparent',
            } as const;

            return (
              <Pressable
                key={ann.id}
                onPress={() => setSelectedAnnotation(ann.id)}
                style={[
                  styles.annotation,
                  style,
                  isSelected && styles.annotationSelected,
                  isSelected && { borderColor: accentColor },
                ]}
              >
                {(ann.type === 'comment' || ann.type === 'text') && (
                  <View style={[styles.annotationBadge, { borderColor: ann.color }]}>
                    <View style={[styles.annotationDot, { backgroundColor: ann.color }]} />
                  </View>
                )}
                {isSelected && (
                  <Pressable onPress={() => removeAnnotation(ann.id)} style={styles.deleteButton}>
                    <View style={styles.deleteDot} />
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
        {selectionRects.length > 0 && selectionBoundsPx ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.selectionToolbar,
              {
                left: selectionBoundsPx.x,
                top:
                  selectionBoundsPx.y + selectionBoundsPx.height + 8 > layout.height - 56
                    ? Math.max(8, selectionBoundsPx.y - 52)
                    : selectionBoundsPx.y + selectionBoundsPx.height + 8,
              },
            ]}
          >
            <Pressable onPress={() => applySelection('comment')} style={styles.selectionAction}>
              <View style={styles.selectionActionDot} />
            </Pressable>
            <Pressable onPress={() => applySelection('highlight')} style={styles.selectionAction}>
              <View style={[styles.selectionSwatch, { backgroundColor: annotationColor }]} />
            </Pressable>
            <Pressable onPress={() => applySelection('strikeout')} style={[styles.selectionAction, styles.selectionActionLast]}>
              <View style={[styles.selectionStrike, { backgroundColor: annotationColor }]} />
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    alignItems: 'center',
  },
  container: {
    alignSelf: 'center',
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
  selectionLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  selectionHighlight: {
    position: 'absolute',
    backgroundColor: 'rgba(245, 158, 11, 0.28)',
    borderRadius: 4,
  },
  selectionOutline: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(37, 99, 235, 0.9)',
    borderRadius: 6,
  },
  selectionHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#2563eb',
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
  annotationBadge: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  annotationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  selectionToolbar: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionAction: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  selectionActionLast: {
    marginRight: 0,
  },
  selectionActionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f9fafb',
  },
  selectionSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  selectionStrike: {
    width: 14,
    height: 3,
    borderRadius: 3,
  },
});

export default PageRenderer;
