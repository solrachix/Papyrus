import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
} from "react-native";
import Svg, { Path as SvgPath } from "react-native-svg";
import { useViewerStore } from "@papyrus-sdk/core";
import { Annotation, DocumentEngine, TextSelection } from "@papyrus-sdk/types";
import {
  PapyrusPageView,
  type PapyrusPageViewProps,
} from "@papyrus-sdk/engine-native";
import {
  createBurstMonitor,
  isMobilePerfEnabled,
  logPerfEvent,
  perfNow,
} from "../perf/mobilePerf";

type PageViewComponentType = React.ComponentType<
  PapyrusPageViewProps & React.RefAttributes<any>
>;

interface PageRendererProps {
  engine: DocumentEngine;
  pageIndex: number;
  scale?: number;
  PageViewComponent?: PageViewComponentType;
  availableWidth?: number;
  horizontalPadding?: number;
  spacing?: number;
}

type NormalizedRect = { x: number; y: number; width: number; height: number };

type TextMarkupType = "highlight" | "underline" | "squiggly" | "strikeout";

const TEXT_MARKUP_TOOLS = new Set<TextMarkupType>([
  "highlight",
  "underline",
  "squiggly",
  "strikeout",
]);

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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const getRectKey = (rect: NormalizedRect) =>
  `${Math.round(rect.x * 10000)}-${Math.round(rect.y * 10000)}-${Math.round(
    rect.width * 10000
  )}-${Math.round(rect.height * 10000)}`;

const mergeSelectionRects = (
  inputRects: NormalizedRect[]
): NormalizedRect[] => {
  if (!inputRects.length) return [];
  const uniqueRects = inputRects
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      x: clamp01(rect.x),
      y: clamp01(rect.y),
      width: clamp01(rect.width),
      height: clamp01(rect.height),
    }))
    .filter((rect, index, list) => {
      const key = getRectKey(rect);
      return (
        list.findIndex((candidate) => getRectKey(candidate) === key) === index
      );
    })
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  return uniqueRects.reduce<NormalizedRect[]>((acc, rect) => {
    const mergeTarget = acc.find((candidate) => {
      const closeY =
        Math.abs(candidate.y - rect.y) < 0.002 &&
        Math.abs(candidate.height - rect.height) < 0.002;
      const overlaps =
        rect.x <= candidate.x + candidate.width + 0.002 &&
        rect.x + rect.width >= candidate.x - 0.002;
      return closeY && overlaps;
    });
    if (!mergeTarget) {
      acc.push({ ...rect });
      return acc;
    }
    const left = Math.min(mergeTarget.x, rect.x);
    const right = Math.max(
      mergeTarget.x + mergeTarget.width,
      rect.x + rect.width
    );
    mergeTarget.x = left;
    mergeTarget.width = right - left;
    return acc;
  }, []);
};

const buildSquigglyPath = (segments = 16) => {
  let path = "M 0 6";
  for (let index = 1; index <= segments; index += 1) {
    const x = (index / segments) * 100;
    const y = index % 2 === 0 ? 6 : 2;
    path += ` L ${x} ${y}`;
  }
  return path;
};

const SQUIGGLY_PATH = buildSquigglyPath();

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
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const isNative = Platform.OS === "android" || Platform.OS === "ios";
  const perfEnabled = isMobilePerfEnabled();
  const renderCountRef = useRef(0);
  const setStateBurstRef = useRef(
    createBurstMonitor("PageRenderer", "setDocumentState", 18, 700)
  );

  const zoom = useViewerStore((state) => state.zoom);
  const rotation = useViewerStore((state) => state.rotation);
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const annotations = useViewerStore((state) => state.annotations);
  const annotationColor = useViewerStore((state) => state.annotationColor);
  const addAnnotation = useViewerStore((state) => state.addAnnotation);
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const activeTool = useViewerStore((state) => state.activeTool);
  const accentColor = useViewerStore((state) => state.accentColor);
  const selectedAnnotationId = useViewerStore(
    (state) => state.selectedAnnotationId
  );
  const setSelectedAnnotation = useViewerStore(
    (state) => state.setSelectedAnnotation
  );
  const removeAnnotation = useViewerStore((state) => state.removeAnnotation);
  const searchResults = useViewerStore((state) => state.searchResults);
  const activeSearchIndex = useViewerStore((state) => state.activeSearchIndex);
  const setSelectionActive = useViewerStore(
    (state) => state.setSelectionActive
  );

  const setDocumentStateTracked = useCallback(
    (state: Parameters<typeof setDocumentState>[0], reason: string) => {
      if (perfEnabled) {
        setStateBurstRef.current({
          reason,
          page: pageIndex + 1,
          keys: Object.keys(state).join(","),
        });
      }
      setDocumentState(state);
    },
    [pageIndex, perfEnabled, setDocumentState]
  );

  const logSelectionPerf = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (!perfEnabled) return;
      logPerfEvent("PageRenderer", event, {
        page: pageIndex + 1,
        ...payload,
      });
    },
    [pageIndex, perfEnabled]
  );

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

  renderCountRef.current += 1;
  if (
    perfEnabled &&
    (renderCountRef.current === 1 || renderCountRef.current % 20 === 0)
  ) {
    logPerfEvent("PageRenderer", "render", {
      page: pageIndex + 1,
      renderCount: renderCountRef.current,
      zoom,
      rotation,
      annotationCount: pageAnnotations.length,
      searchHits: pageSearchHits.length,
    });
  }

  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectionRects, setSelectionRects] = useState<
    Array<{ x: number; y: number; width: number; height: number }>
  >([]);
  const [selectionBounds, setSelectionBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectionText, setSelectionText] = useState("");
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionStart = useRef<{ x: number; y: number } | null>(null);
  const selectionRectRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const selectionBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const selectionBoundsStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null
  );
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const isPinchingRef = useRef(false);
  const pinchLogZoomRef = useRef(zoom);
  const [isInkDrawing, setIsInkDrawing] = useState(false);
  const [inkPoints, setInkPoints] = useState<Array<{ x: number; y: number }>>(
    []
  );
  const inkPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    if (!layout.width || !layout.height) return;
    const viewTag = findNodeHandle(viewRef.current);
    if (viewTag) {
      const renderScale = isNative ? scale / Math.max(zoom, 0.5) : scale;
      const startedAt = perfEnabled ? perfNow() : 0;
      void Promise.resolve(engine.renderPage(pageIndex, viewTag, renderScale))
        .then(() => {
          if (!perfEnabled) return;
          const renderDurationMs = perfNow() - startedAt;
          if (renderDurationMs >= 40) {
            logPerfEvent("PageRenderer", "renderPage.slow", {
              page: pageIndex + 1,
              renderDurationMs: Math.round(renderDurationMs * 100) / 100,
              layoutWidth: layout.width,
              layoutHeight: layout.height,
              renderScale: Math.round(renderScale * 100) / 100,
            });
          }
        })
        .catch((error: unknown) => {
          logPerfEvent("PageRenderer", "renderPage.error", {
            page: pageIndex + 1,
            message: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }, [
    engine,
    pageIndex,
    scale,
    zoom,
    rotation,
    layout.width,
    layout.height,
    isNative,
    perfEnabled,
  ]);

  useEffect(() => {
    let active = true;
    const loadDimensions = async () => {
      const startedAt = perfEnabled ? perfNow() : 0;
      const dims = await engine.getPageDimensions(pageIndex);
      if (!active) return;
      if (dims.width > 0 && dims.height > 0) {
        setPageSize({ width: dims.width, height: dims.height });
      }
      if (perfEnabled) {
        const durationMs = perfNow() - startedAt;
        if (durationMs >= 20 || pageIndex === 0) {
          logPerfEvent("PageRenderer", "pageDimensions", {
            page: pageIndex + 1,
            durationMs: Math.round(durationMs * 100) / 100,
            width: dims.width,
            height: dims.height,
          });
        }
      }
    };
    void loadDimensions();
    return () => {
      active = false;
    };
  }, [engine, pageIndex, perfEnabled]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== layout.width || height !== layout.height) {
      setLayout({ width, height });
    }
  };

  const addAnnotationAt = (
    x: number,
    y: number,
    width: number,
    height: number,
    type: Annotation["type"],
    extras?: Partial<Pick<Annotation, "rects" | "path" | "content">>
  ) => {
    const rect = {
      x: clamp01(x),
      y: clamp01(y),
      width: clamp01(width),
      height: clamp01(height),
    };
    logSelectionPerf("annotation.add", {
      type,
      rect,
      rectCount: extras?.rects?.length ?? 0,
    });
    addAnnotation({
      id: Math.random().toString(36).slice(2, 9),
      pageIndex,
      type,
      rect,
      rects: extras?.rects,
      path: extras?.path,
      color: annotationColor,
      content:
        extras?.content ??
        (type === "text" || type === "comment" ? "" : undefined),
      createdAt: Date.now(),
    });
  };

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const getBoundsFromRects = (
    rects: Array<{ x: number; y: number; width: number; height: number }>
  ) => {
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

  useEffect(() => {
    inkPointsRef.current = inkPoints;
  }, [inkPoints]);

  useEffect(() => {
    if (activeTool === "ink") return;
    setIsInkDrawing(false);
    setInkPoints([]);
    inkPointsRef.current = [];
  }, [activeTool]);

  const clearSelection = () => {
    setSelectionRect(null);
    selectionRectRef.current = null;
    setSelectionRects([]);
    setSelectionBounds(null);
    selectionBoundsRef.current = null;
    setSelectionText("");
    setIsSelecting(false);
    selectionStart.current = null;
    selectionBoundsStart.current = null;
    lastTapRef.current = null;
    setSelectionActive(false);
  };

  useEffect(() => {
    if (activeTool === "select") return;
    clearSelection();
  }, [activeTool]);

  const stopPressPropagation = (event: GestureResponderEvent) => {
    event.stopPropagation?.();
  };

  const applySelectionResult = (selection: TextSelection | null) => {
    if (!selection || !selection.rects || selection.rects.length === 0) {
      logSelectionPerf("selection.empty", {
        tool: activeTool,
      });
      clearSelection();
      return;
    }
    const mergedRects = mergeSelectionRects(selection.rects);
    if (mergedRects.length === 0) {
      logSelectionPerf("selection.merged.empty", {
        tool: activeTool,
        sourceRectCount: selection.rects.length,
      });
      clearSelection();
      return;
    }
    const bounds = getBoundsFromRects(mergedRects);
    if (!bounds) {
      logSelectionPerf("selection.bounds.empty", {
        tool: activeTool,
        mergedRectCount: mergedRects.length,
      });
      clearSelection();
      return;
    }
    const selectedText = selection.text || "";
    logSelectionPerf("selection.ready", {
      tool: activeTool,
      sourceRectCount: selection.rects.length,
      mergedRectCount: mergedRects.length,
      bounds,
      textLength: selectedText.length,
    });
    if (TEXT_MARKUP_TOOLS.has(activeTool as TextMarkupType)) {
      addAnnotationAt(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        activeTool as TextMarkupType,
        {
          rects: mergedRects,
          content: selectedText,
        }
      );
      clearSelection();
      return;
    }
    setSelectionRects(mergedRects);
    setSelectionText(selectedText);
    setSelectionBounds(bounds);
    selectionBoundsRef.current = bounds;
    setSelectionActive(true);
  };

  const selectFromBounds = async (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => {
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

  const getTouchDistance = (
    touches: Array<{ pageX: number; pageY: number }>
  ) => {
    if (touches.length < 2) return 0;
    const [a, b] = touches;
    return Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY);
  };

  const shouldHandlePinch = (
    touches: Array<{ pageX: number; pageY: number }>
  ) => isNative && touches.length === 2;

  const handlePinchStart = (
    touches: Array<{ pageX: number; pageY: number }>
  ) => {
    if (!shouldHandlePinch(touches)) return;
    const distance = getTouchDistance(touches);
    pinchRef.current = { distance, zoom };
    pinchLogZoomRef.current = zoom;
    logSelectionPerf("pinch.start", {
      tool: activeTool,
      distance: Math.round(distance * 100) / 100,
      zoom: Math.round(zoom * 100) / 100,
    });
  };

  const handlePinchMove = (
    touches: Array<{ pageX: number; pageY: number }>
  ) => {
    if (!shouldHandlePinch(touches) || !pinchRef.current) return;
    const distance = getTouchDistance(touches);
    if (!distance) return;
    const scale = distance / pinchRef.current.distance;
    const nextZoom = clamp(pinchRef.current.zoom * scale, 0.5, 4.0);
    setDocumentStateTracked({ zoom: nextZoom }, "pinchMove");
    engine.setZoom(nextZoom);
    if (Math.abs(nextZoom - pinchLogZoomRef.current) >= 0.12) {
      pinchLogZoomRef.current = nextZoom;
      logSelectionPerf("pinch.move", {
        tool: activeTool,
        distance: Math.round(distance * 100) / 100,
        zoom: Math.round(nextZoom * 100) / 100,
      });
    }
  };

  const handlePinchEnd = () => {
    if (isPinchingRef.current || pinchRef.current) {
      logSelectionPerf("pinch.end", {
        tool: activeTool,
        zoom: Math.round(zoom * 100) / 100,
      });
    }
    pinchRef.current = null;
  };

  const handlePress = (event: GestureResponderEvent) => {
    if (!layout.width || !layout.height) return;
    const { locationX, locationY } = event.nativeEvent;
    if (selectionRects.length > 0 || selectionBounds) {
      const selectionPx =
        selectionBounds && layout.width && layout.height
          ? {
              x: selectionBounds.x * layout.width,
              y: selectionBounds.y * layout.height,
              width: selectionBounds.width * layout.width,
              height: selectionBounds.height * layout.height,
            }
          : null;
      if (selectionPx) {
        const toolbarTop =
          selectionPx.y + selectionPx.height + 8 > layout.height - 56
            ? Math.max(8, selectionPx.y - 52)
            : selectionPx.y + selectionPx.height + 8;
        const withinSelectionUi =
          locationX >= selectionPx.x - 24 &&
          locationX <= selectionPx.x + Math.max(220, selectionPx.width) + 24 &&
          locationY >= Math.min(selectionPx.y, toolbarTop) - 24 &&
          locationY <=
            Math.max(selectionPx.y + selectionPx.height, toolbarTop + 56) + 24;
        if (withinSelectionUi) {
          return;
        }
      }
      clearSelection();
      return;
    }
    setSelectedAnnotation(null);
    if (!isNative || activeTool === "ink") return;

    const now = Date.now();
    const lastTap = lastTapRef.current;
    lastTapRef.current = { time: now, x: locationX, y: locationY };

    if (!lastTap) return;
    const timeDelta = now - lastTap.time;
    const distance = Math.hypot(locationX - lastTap.x, locationY - lastTap.y);
    if (timeDelta < 280 && distance < 24 && activeTool === "select") {
      void selectAtPoint(locationX, locationY);
    }
  };

  const selectionEnabled =
    Platform.OS === "web" ||
    (isNative &&
      (activeTool === "select" ||
        TEXT_MARKUP_TOOLS.has(activeTool as TextMarkupType)));
  const inkEnabled = isNative && activeTool === "ink";
  const pinchEnabled = isNative;

  const toNormalizedPoint = (x: number, y: number) => {
    if (!layout.width || !layout.height) return null;
    return {
      x: clamp01(x / layout.width),
      y: clamp01(y / layout.height),
    };
  };

  const beginInkDrawing = (x: number, y: number) => {
    const point = toNormalizedPoint(x, y);
    if (!point) return;
    clearSelection();
    setIsInkDrawing(true);
    setInkPoints([point]);
    inkPointsRef.current = [point];
  };

  const pushInkPoint = (x: number, y: number) => {
    const point = toNormalizedPoint(x, y);
    if (!point) return;
    const previous = inkPointsRef.current[inkPointsRef.current.length - 1];
    if (previous) {
      const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
      if (distance < 0.0008) return;
    }
    setInkPoints((prev) => [...prev, point]);
    inkPointsRef.current = [...inkPointsRef.current, point];
  };

  const finishInkDrawing = () => {
    const points = inkPointsRef.current;
    if (points.length === 0) return;
    setIsInkDrawing(false);
    setInkPoints([]);
    inkPointsRef.current = [];
    if (points.length < 2) return;

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    addAnnotationAt(
      minX,
      minY,
      Math.max(0.0005, maxX - minX),
      Math.max(0.0005, maxY - minY),
      "ink",
      { path: points }
    );
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
          const touches = event.nativeEvent.touches ?? [];
          return (
            (pinchEnabled && shouldHandlePinch(touches)) ||
            selectionEnabled ||
            inkEnabled
          );
        },
        onMoveShouldSetPanResponder: (event) => {
          const touches = event.nativeEvent.touches ?? [];
          return (
            (pinchEnabled && shouldHandlePinch(touches)) ||
            selectionEnabled ||
            inkEnabled
          );
        },
        onStartShouldSetPanResponderCapture: (event) => {
          const touches = event.nativeEvent.touches ?? [];
          return pinchEnabled && shouldHandlePinch(touches);
        },
        onMoveShouldSetPanResponderCapture: (event) => {
          const touches = event.nativeEvent.touches ?? [];
          return pinchEnabled && shouldHandlePinch(touches);
        },
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches ?? [];
          if (pinchEnabled && shouldHandlePinch(touches)) {
            isPinchingRef.current = true;
            setIsSelecting(false);
            selectionStart.current = null;
            handlePinchStart(touches);
            return;
          }
          isPinchingRef.current = false;

          if (inkEnabled) {
            beginInkDrawing(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );
            return;
          }

          if (!selectionEnabled || !layout.width || !layout.height) return;
          const { locationX, locationY } = event.nativeEvent;
          selectionStart.current = { x: locationX, y: locationY };
          setIsSelecting(true);
          const rect = { x: locationX, y: locationY, width: 0, height: 0 };
          selectionRectRef.current = rect;
          setSelectionRect(rect);
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches ?? [];
          if (
            pinchEnabled &&
            (shouldHandlePinch(touches) || isPinchingRef.current)
          ) {
            if (shouldHandlePinch(touches)) {
              if (!isPinchingRef.current) {
                isPinchingRef.current = true;
                handlePinchStart(touches);
              }
              handlePinchMove(touches);
            }
            return;
          }

          if (inkEnabled) {
            pushInkPoint(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );
            return;
          }
          if (!selectionEnabled || !selectionStart.current) return;
          const start = selectionStart.current;
          const currentX = start.x + gestureState.dx;
          const currentY = start.y + gestureState.dy;
          const left = Math.max(0, Math.min(start.x, currentX));
          const top = Math.max(0, Math.min(start.y, currentY));
          const right = Math.min(layout.width, Math.max(start.x, currentX));
          const bottom = Math.min(layout.height, Math.max(start.y, currentY));
          const rect = {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          };
          selectionRectRef.current = rect;
          setSelectionRect(rect);
        },
        onPanResponderRelease: async () => {
          if (isPinchingRef.current) {
            isPinchingRef.current = false;
            handlePinchEnd();
            return;
          }

          if (inkEnabled) {
            finishInkDrawing();
            return;
          }

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
        onPanResponderTerminate: () => {
          if (isPinchingRef.current) {
            isPinchingRef.current = false;
            handlePinchEnd();
            return;
          }

          if (inkEnabled) {
            finishInkDrawing();
            return;
          }
          setIsSelecting(false);
          selectionStart.current = null;
        },
      }),
    [
      selectionEnabled,
      inkEnabled,
      pinchEnabled,
      layout.width,
      layout.height,
      annotationColor,
      zoom,
    ]
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

  const createHandleResponder = (handle: "start" | "end") =>
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

        if (handle === "start") {
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
    () => createHandleResponder("start"),
    [layout.width, layout.height, engine, pageIndex]
  );

  const endHandleResponder = useMemo(
    () => createHandleResponder("end"),
    [layout.width, layout.height, engine, pageIndex]
  );

  const applySelection = (type: TextMarkupType | "comment") => {
    if (selectionRects.length === 0) return;
    const mergedRects = mergeSelectionRects(selectionRects);
    const bounds = getBoundsFromRects(mergedRects);
    if (!bounds || mergedRects.length === 0) {
      clearSelection();
      return;
    }

    if (type === "comment") {
      const first = mergedRects[0];
      addAnnotationAt(
        first.x,
        first.y,
        Math.max(0.08, first.width),
        Math.max(0.06, first.height),
        "comment",
        { content: selectionText }
      );
      clearSelection();
      return;
    }

    addAnnotationAt(bounds.x, bounds.y, bounds.width, bounds.height, type, {
      rects: mergedRects,
      content: selectionText,
    });
    clearSelection();
  };

  const themeOverlayStyle = useMemo(() => {
    switch (pageTheme) {
      case "sepia":
        return styles.themeSepia;
      case "dark":
        return styles.themeDark;
      case "high-contrast":
        return styles.themeContrast;
      default:
        return styles.themeNone;
    }
  }, [pageTheme]);

  const aspectRatio =
    pageSize && pageSize.width > 0 && pageSize.height > 0
      ? pageSize.width / pageSize.height
      : 0.77;
  const containerWidth = availableWidth ?? windowWidth;
  const baseWidth = containerWidth * 0.92;
  const pageWidth = isNative ? baseWidth * zoom : baseWidth;
  const pageHeight = pageWidth / aspectRatio;
  const hasActiveSelection =
    selectionRects.length > 0 || !!selectionBounds || isSelecting;
  const scrollEnabled =
    isNative && zoom > 1 && !hasActiveSelection && !isInkDrawing;

  return (
    <ScrollView
      horizontal
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        { paddingHorizontal: horizontalPadding },
      ]}
    >
      <Pressable
        {...panResponder.panHandlers}
        style={[
          styles.container,
          { width: pageWidth, height: pageHeight, marginBottom: spacing },
        ]}
        onLayout={handleLayout}
        onPress={handlePress}
      >
        <PageViewComponent ref={viewRef} style={styles.page} />
        <View
          pointerEvents="none"
          style={[styles.themeOverlay, themeOverlayStyle]}
        />
        <View pointerEvents="box-none" style={styles.selectionLayer}>
          <View pointerEvents="none">
            {selectionRects.map((rect, index) => {
              const style = {
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              } as const;
              return (
                <View
                  key={`sel-${index}`}
                  style={[styles.selectionHighlight, style]}
                />
              );
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
                style={[
                  styles.selectionHandle,
                  { left: -8, top: -8, borderColor: accentColor },
                ]}
              />
              <View
                {...endHandleResponder.panHandlers}
                style={[
                  styles.selectionHandle,
                  { right: -8, bottom: -8, borderColor: accentColor },
                ]}
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
                    {
                      borderColor: accentColor,
                      backgroundColor: `${accentColor}26`,
                    },
                    isActive && styles.searchHighlightActive,
                    isActive && {
                      borderColor: accentColor,
                      backgroundColor: `${accentColor}40`,
                    },
                    highlightStyle,
                  ]}
                />
              );
            });
          })}
        </View>
        {isInkDrawing && inkPoints.length > 1 ? (
          <View pointerEvents="none" style={styles.inkPreviewLayer}>
            <Svg
              width="100%"
              height="100%"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
            >
              <SvgPath
                d={inkPoints
                  .map(
                    (point, pointIndex) =>
                      `${pointIndex === 0 ? "M" : "L"} ${point.x} ${point.y}`
                  )
                  .join(" ")}
                fill="none"
                stroke={annotationColor}
                strokeWidth={0.006}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>
        ) : null}
        <View pointerEvents="box-none" style={styles.annotationLayer}>
          {pageAnnotations.map((ann) => {
            const isSelected = selectedAnnotationId === ann.id;
            const isText = ann.type === "comment" || ann.type === "text";
            const isInk =
              ann.type === "ink" &&
              Array.isArray(ann.path) &&
              ann.path.length > 1;
            const isMarkup = TEXT_MARKUP_TOOLS.has(ann.type as TextMarkupType);
            const rects =
              ann.rects && ann.rects.length > 0 ? ann.rects : [ann.rect];
            const hitTargetStyle = {
              left: `${ann.rect.x * 100}%`,
              top: `${ann.rect.y * 100}%`,
              width: `${ann.rect.width * 100}%`,
              height: `${ann.rect.height * 100}%`,
            } as const;

            return (
              <View
                key={ann.id}
                pointerEvents="box-none"
                style={styles.annotationGroup}
              >
                {isMarkup
                  ? rects.map((rect, rectIndex) => {
                      const rectStyle = {
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.width * 100}%`,
                        height: `${rect.height * 100}%`,
                      } as const;

                      if (ann.type === "highlight") {
                        return (
                          <View
                            key={`${ann.id}-mark-${rectIndex}`}
                            pointerEvents="none"
                            style={[
                              styles.annotationMarkupRect,
                              rectStyle,
                              { backgroundColor: withAlpha(ann.color, 0.38) },
                            ]}
                          />
                        );
                      }

                      if (ann.type === "underline") {
                        return (
                          <View
                            key={`${ann.id}-mark-${rectIndex}`}
                            pointerEvents="none"
                            style={[styles.annotationLineContainer, rectStyle]}
                          >
                            <View
                              style={[
                                styles.annotationUnderlineLine,
                                { backgroundColor: ann.color },
                              ]}
                            />
                          </View>
                        );
                      }

                      if (ann.type === "strikeout") {
                        return (
                          <View
                            key={`${ann.id}-mark-${rectIndex}`}
                            pointerEvents="none"
                            style={[styles.annotationLineContainer, rectStyle]}
                          >
                            <View
                              style={[
                                styles.annotationStrikeLine,
                                { backgroundColor: ann.color },
                              ]}
                            />
                          </View>
                        );
                      }

                      return (
                        <View
                          key={`${ann.id}-mark-${rectIndex}`}
                          pointerEvents="none"
                          style={[styles.annotationLineContainer, rectStyle]}
                        >
                          <View style={styles.annotationSquigglyWrap}>
                            <Svg
                              width="100%"
                              height="100%"
                              viewBox="0 0 100 8"
                              preserveAspectRatio="none"
                            >
                              <SvgPath
                                d={SQUIGGLY_PATH}
                                fill="none"
                                stroke={ann.color}
                                strokeWidth={1.8}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </Svg>
                          </View>
                        </View>
                      );
                    })
                  : null}
                {isInk && ann.path ? (
                  <Svg
                    pointerEvents="none"
                    style={styles.inkAnnotationLayer}
                    width="100%"
                    height="100%"
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                  >
                    <SvgPath
                      d={ann.path
                        .map(
                          (point, pointIndex) =>
                            `${pointIndex === 0 ? "M" : "L"} ${point.x} ${
                              point.y
                            }`
                        )
                        .join(" ")}
                      fill="none"
                      stroke={ann.color}
                      strokeWidth={0.006}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                ) : null}
                <Pressable
                  onPress={(event) => {
                    stopPressPropagation(event);
                    setSelectedAnnotation(ann.id);
                  }}
                  style={[
                    styles.annotation,
                    hitTargetStyle,
                    isSelected && styles.annotationSelected,
                    isSelected && { borderColor: accentColor },
                  ]}
                >
                  {isText && (
                    <View
                      style={[
                        styles.annotationBadge,
                        { borderColor: ann.color },
                      ]}
                    >
                      <View
                        style={[
                          styles.annotationDot,
                          { backgroundColor: ann.color },
                        ]}
                      />
                    </View>
                  )}
                  {isSelected && (
                    <Pressable
                      onPress={(event) => {
                        stopPressPropagation(event);
                        removeAnnotation(ann.id);
                      }}
                      style={styles.deleteButton}
                    >
                      <View style={styles.deleteDot} />
                    </Pressable>
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
        {selectionRects.length > 0 &&
        selectionBoundsPx &&
        activeTool === "select" ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.selectionToolbar,
              {
                left: selectionBoundsPx.x,
                top:
                  selectionBoundsPx.y + selectionBoundsPx.height + 8 >
                  layout.height - 56
                    ? Math.max(8, selectionBoundsPx.y - 52)
                    : selectionBoundsPx.y + selectionBoundsPx.height + 8,
              },
            ]}
          >
            <Pressable
              onPress={(event) => {
                stopPressPropagation(event);
                applySelection("comment");
              }}
              style={styles.selectionAction}
            >
              <View style={styles.selectionActionDot} />
            </Pressable>
            <Pressable
              onPress={(event) => {
                stopPressPropagation(event);
                applySelection("highlight");
              }}
              style={styles.selectionAction}
            >
              <View
                style={[
                  styles.selectionSwatch,
                  { backgroundColor: annotationColor },
                ]}
              />
            </Pressable>
            <Pressable
              onPress={(event) => {
                stopPressPropagation(event);
                applySelection("underline");
              }}
              style={styles.selectionAction}
            >
              <View
                style={[
                  styles.selectionUnderline,
                  { backgroundColor: annotationColor },
                ]}
              />
            </Pressable>
            <Pressable
              onPress={(event) => {
                stopPressPropagation(event);
                applySelection("squiggly");
              }}
              style={styles.selectionAction}
            >
              <View style={styles.selectionSquigglyWrap}>
                <Svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 100 8"
                  preserveAspectRatio="none"
                >
                  <SvgPath
                    d={SQUIGGLY_PATH}
                    fill="none"
                    stroke={annotationColor}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>
            </Pressable>
            <Pressable
              onPress={(event) => {
                stopPressPropagation(event);
                applySelection("strikeout");
              }}
              style={[styles.selectionAction, styles.selectionActionLast]}
            >
              <View
                style={[
                  styles.selectionStrike,
                  { backgroundColor: annotationColor },
                ]}
              />
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    alignItems: "center",
  },
  container: {
    alignSelf: "center",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  page: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    overflow: "hidden",
  },
  annotationLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  annotationGroup: {
    ...StyleSheet.absoluteFillObject,
  },
  searchLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  inkPreviewLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  selectionLayer: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  selectionHighlight: {
    position: "absolute",
    backgroundColor: "rgba(245, 158, 11, 0.28)",
    borderRadius: 4,
  },
  selectionOutline: {
    position: "absolute",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(37, 99, 235, 0.9)",
    borderRadius: 6,
  },
  selectionHandle: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#2563eb",
  },
  searchHighlight: {
    position: "absolute",
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.35)",
    borderRadius: 4,
  },
  searchHighlightActive: {
    backgroundColor: "rgba(59, 130, 246, 0.35)",
    borderColor: "#3b82f6",
  },
  themeOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  themeNone: {
    backgroundColor: "transparent",
  },
  themeSepia: {
    backgroundColor: "rgba(244, 236, 216, 0.35)",
  },
  themeDark: {
    backgroundColor: "rgba(0, 0, 0, 0.2)",
  },
  themeContrast: {
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  annotation: {
    position: "absolute",
  },
  inkAnnotationLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  annotationMarkupRect: {
    position: "absolute",
    borderRadius: 2,
  },
  annotationLineContainer: {
    position: "absolute",
  },
  annotationUnderlineLine: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
  },
  annotationStrikeLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    marginTop: -1,
    height: 2,
    borderRadius: 2,
  },
  annotationSquigglyWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 8,
  },
  annotationSelected: {
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  annotationBadge: {
    position: "absolute",
    left: 4,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  annotationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  deleteButton: {
    position: "absolute",
    right: -8,
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteDot: {
    width: 8,
    height: 2,
    backgroundColor: "#ffffff",
    borderRadius: 2,
  },
  selectionToolbar: {
    position: "absolute",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
  },
  selectionAction: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  selectionActionLast: {
    marginRight: 0,
  },
  selectionActionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f9fafb",
  },
  selectionSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#ffffff",
  },
  selectionUnderline: {
    width: 14,
    height: 2,
    borderRadius: 2,
  },
  selectionSquigglyWrap: {
    width: 14,
    height: 8,
  },
  selectionStrike: {
    width: 14,
    height: 3,
    borderRadius: 3,
  },
});

const arePageRendererPropsEqual = (
  previous: Readonly<PageRendererProps>,
  next: Readonly<PageRendererProps>
) =>
  previous.engine === next.engine &&
  previous.pageIndex === next.pageIndex &&
  previous.scale === next.scale &&
  previous.PageViewComponent === next.PageViewComponent &&
  previous.availableWidth === next.availableWidth &&
  previous.horizontalPadding === next.horizontalPadding &&
  previous.spacing === next.spacing;

export default memo(PageRenderer, arePageRendererPropsEqual);
