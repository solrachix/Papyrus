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
  PanResponder,
  Platform,
  findNodeHandle,
  useWindowDimensions,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Svg, { Path as SvgPath } from "react-native-svg";
import { createRenderGeneration, useViewerStore } from "@papyrus-sdk/core";
import { Annotation, DocumentEngine, RenderPageResult, TextSelection } from "@papyrus-sdk/types";
import {
  PapyrusPageView,
  type PapyrusPageViewProps,
} from "@papyrus-sdk/engine-native";
import { isMobilePerfEnabled, logPerfEvent, perfNow } from "../perf/mobilePerf";
import { useMobilePerf } from "../perf/MobilePerfContext";
import { createRenderLifecycle } from "../perf/renderLifecycle";
import { invokeRenderPage } from "../perf/renderInvocation";
import {
  shouldSuppressPressAfterPinch,
} from "../gesture/pinchZoom";
import { shouldEnableSelectionDrag } from "../gesture/selectionInteraction";
import { resolvePdfCenteredInset } from "../viewport/pdfViewportController";
import { buildCommentTapGestureDeps } from "./PageRenderer.gesture";
import { resolvePdfBasePageWidth } from "./pdfPageMetrics";

type PageViewComponentType = React.ComponentType<
  PapyrusPageViewProps & React.RefAttributes<any>
>;

interface PageRendererProps {
  engine: DocumentEngine;
  pageIndex: number;
  scale?: number;
  pageAspectRatio?: number;
  PageViewComponent?: PageViewComponentType;
  availableWidth?: number;
  pageViewportWidth?: number;
  horizontalPadding?: number;
  spacing?: number;
  onSelectionDragActiveChange?: (active: boolean) => void;
  onPageTap?: () => void;
  gestureScrollLockActive?: boolean;
  lastPinchEndedAt?: number | null;
  requestSelectionVerticalAutoscroll?: (absoluteY: number) => number;
  onRenderReady?: (pageIndex: number, renderedZoom: number) => void;
  surfaceId?: string;
  gestureId?: string;
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
const SELECTION_AUTOSCROLL_INTERVAL_MS = 16;
const PERF_RENDER_TIMEOUT_MS = 5000;

const PageRenderer: React.FC<PageRendererProps> = ({
  engine,
  pageIndex,
  scale = 1,
  pageAspectRatio,
  PageViewComponent = PapyrusPageView as PageViewComponentType,
  availableWidth,
  pageViewportWidth: providedPageViewportWidth,
  horizontalPadding = 16,
  spacing = 24,
  onSelectionDragActiveChange,
  onPageTap,
  gestureScrollLockActive = false,
  lastPinchEndedAt = null,
  requestSelectionVerticalAutoscroll,
  onRenderReady,
  surfaceId = `page-${pageIndex}`,
  gestureId,
}) => {
  const viewRef = useRef<any>(null);
  const onRenderReadyRef = useRef(onRenderReady);
  onRenderReadyRef.current = onRenderReady;
  const gestureIdRef = useRef(gestureId);
  gestureIdRef.current = gestureId;

  const mobilePerf = useMobilePerf();
  const renderGenerationRef = useRef(createRenderGeneration());
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const isNative = Platform.OS === "android" || Platform.OS === "ios";
  const perfEnabled = isMobilePerfEnabled();

  useEffect(() => {
    if (!perfEnabled) return;
    mobilePerf.emit("surface.mount", {
      surfaceId,
      pageIndex,
    });
    return () => {
      mobilePerf.emit("surface.unmount", {
        surfaceId,
        pageIndex,
      });
    };
  }, [mobilePerf, pageIndex, perfEnabled, surfaceId]);
  const renderCountRef = useRef(0);
  const inkDrawingActiveRef = useRef(false);
  const selectionDragActiveRef = useRef(false);
  const selectionDragPointRef = useRef<{
    absoluteY: number;
    x: number;
    y: number;
  } | null>(null);
  const selectionAutoscrollIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const rawTouchMoveLoggedAtRef = useRef(0);
  const currentInkStyleRef = useRef<{
    color: string;
    opacity: number;
    strokeWidth: number;
  }>({
    color: "#fbbf24",
    opacity: 1,
    strokeWidth: 0.006,
  });

  const zoom = useViewerStore((state) => state.zoom);
  const rotation = useViewerStore((state) => state.rotation);
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const annotations = useViewerStore((state) => state.annotations);
  const annotationColor = useViewerStore((state) => state.annotationColor);
  const annotationOpacity = useViewerStore((state) => state.annotationOpacity);
  const inkStrokeWidth = useViewerStore((state) => state.inkStrokeWidth);
  const addAnnotation = useViewerStore((state) => state.addAnnotation);
  const activeTool = useViewerStore((state) => state.activeTool);
  const interactionMode = useViewerStore((state) => state.interactionMode);
  const toolDockOpen = useViewerStore((state) => state.toolDockOpen);
  const resolvedActiveTool = toolDockOpen ? activeTool : "select";
  const resolvedInteractionMode = toolDockOpen ? interactionMode : "pan";
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

  const logGestureDebug = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      if (!perfEnabled || !isNative) return;
      logPerfEvent("PageRenderer", `gesture.${event}`, {
        page: pageIndex + 1,
        activeTool: resolvedActiveTool,
        interactionMode: resolvedInteractionMode,
        pinchActive: gestureScrollLockActive,
        gestureLockActive: gestureScrollLockActive,
        selectionEnabled:
          Platform.OS === "web" ||
          (isNative &&
            shouldEnableSelectionDrag({
              activeTool: resolvedActiveTool,
              interactionMode: resolvedInteractionMode,
            })),
        zoom: Math.round(zoom * 100) / 100,
        ...payload,
      });
    },
    [
      isNative,
      pageIndex,
      perfEnabled,
      resolvedActiveTool,
      resolvedInteractionMode,
      zoom,
    ]
  );

  const logRawTouchDebug = useCallback(
    (phase: "start" | "move" | "end" | "cancel", event: any) => {
      if (!perfEnabled || !isNative) return;
      const touches = Array.isArray(event?.nativeEvent?.touches)
        ? event.nativeEvent.touches.length
        : 0;
      const changedTouches = Array.isArray(event?.nativeEvent?.changedTouches)
        ? event.nativeEvent.changedTouches.length
        : 0;
      if (phase === "move") {
        if (touches < 2 && !gestureScrollLockActive) return;
        const now = Date.now();
        if (now - rawTouchMoveLoggedAtRef.current < 120) return;
        rawTouchMoveLoggedAtRef.current = now;
      }
      logGestureDebug(`touch.${phase}`, {
        touches,
        changedTouches,
        target: event?.nativeEvent?.target ?? null,
        locationX: Math.round((event?.nativeEvent?.locationX ?? 0) * 100) / 100,
        locationY: Math.round((event?.nativeEvent?.locationY ?? 0) * 100) / 100,
        pageX: Math.round((event?.nativeEvent?.pageX ?? 0) * 100) / 100,
        pageY: Math.round((event?.nativeEvent?.pageY ?? 0) * 100) / 100,
      });
    },
    [isNative, logGestureDebug, perfEnabled]
  );

  const setSelectionDragState = useCallback(
    (active: boolean) => {
      if (selectionDragActiveRef.current === active) return;
      selectionDragActiveRef.current = active;
      onSelectionDragActiveChange?.(active);
    },
    [onSelectionDragActiveChange]
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
  const [isInkDrawing, setIsInkDrawing] = useState(false);
  const [inkPoints, setInkPoints] = useState<Array<{ x: number; y: number }>>(
    []
  );
  const inkPointsRef = useRef<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    if (!layout.width || !layout.height) return;
    const generation = renderGenerationRef.current.next();
    const viewTag = findNodeHandle(viewRef.current);
    if (viewTag) {
      const renderScale = isNative ? scale / Math.max(zoom, 0.5) : scale;
      const startedAt = perfEnabled ? perfNow() : 0;
      const renderRequestId = perfEnabled ? mobilePerf.createId("render") : "noop";
      const lifecycle = createRenderLifecycle();
      const renderGestureId = gestureIdRef.current;
      const renderTimeout = perfEnabled
        ? setTimeout(() => {
            if (!lifecycle.abandon("timeout")) return;
            mobilePerf.emit("render.abandoned", {
              renderRequestId,
              surfaceId,
              pageIndex,
              generation,
              gestureId: renderGestureId,
              reason: "timeout",
            });
          }, PERF_RENDER_TIMEOUT_MS)
        : null;
      if (perfEnabled) {
        mobilePerf.emit("render.request", {
          renderRequestId,
          surfaceId,
          pageIndex,
          zoom,
          generation,
          gestureId: renderGestureId,
          layoutWidth: layout.width,
          layoutHeight: layout.height,
          renderScale,
          estimatedTargetPixels: Math.round(
            layout.width * layout.height * renderScale * renderScale
          ),
        });
        mobilePerf.emit("render.start", {
          renderRequestId,
          surfaceId,
          pageIndex,
          zoom,
          generation,
          gestureId: renderGestureId,
          renderScale,
        });
      }
      const renderPromise = invokeRenderPage(engine, pageIndex, viewTag, renderScale, {
        enabled: perfEnabled,
        renderRequestId,
        surfaceId,
        pageIndex,
        generation,
        ...mobilePerf.context,
      });
      void renderPromise
        .then((result: void | RenderPageResult) => {
          if (renderTimeout) clearTimeout(renderTimeout);
          const status = result && typeof result === "object" ? result.status : "ready";
          if (!lifecycle.complete(status)) return;
          if (perfEnabled) {
            mobilePerf.emit("render.end", {
              renderRequestId,
              surfaceId,
              pageIndex,
              zoom,
              generation,
              gestureId: renderGestureId,
              status,
              durationMs: Math.round((perfNow() - startedAt) * 100) / 100,
            });
            mobilePerf.emit(`render.${status}`, {
              renderRequestId,
              surfaceId,
              pageIndex,
              zoom,
              generation,
              gestureId: renderGestureId,
            });
          }
          if (status !== "ready" || !renderGenerationRef.current.isCurrent(generation)) return;
          onRenderReadyRef.current?.(pageIndex, zoom);
          if (!perfEnabled) return;
          const lifecycleStats = (
            engine as DocumentEngine & {
              getLifecycleStats?: () => Record<string, number>;
            }
          ).getLifecycleStats?.();
          if (lifecycleStats) {
            mobilePerf.emit("lifecycle.counters", lifecycleStats);
          }
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
          if (renderTimeout) clearTimeout(renderTimeout);
          if (!lifecycle.complete("error")) return;
          if (perfEnabled) {
            mobilePerf.emit("render.end", {
              renderRequestId,
              surfaceId,
              pageIndex,
              generation,
              gestureId: renderGestureId,
              status: "error",
              durationMs: Math.round((perfNow() - startedAt) * 100) / 100,
            });
            mobilePerf.emit("render.error", {
              renderRequestId,
              surfaceId,
              pageIndex,
              generation,
              gestureId: renderGestureId,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
          logPerfEvent("PageRenderer", "renderPage.error", {
            page: pageIndex + 1,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return () => {
        if (renderTimeout) clearTimeout(renderTimeout);
        if (lifecycle.abandon("unmount")) {
          if (perfEnabled) {
            mobilePerf.emit("render.abandoned", {
              renderRequestId,
              surfaceId,
              pageIndex,
              generation,
              gestureId: renderGestureId,
              reason: "unmount",
            });
          }
        }
      };
    }
    return undefined;
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
    mobilePerf,
    surfaceId,
  ]);

  useEffect(() => {
    if (
      typeof pageAspectRatio === "number" &&
      Number.isFinite(pageAspectRatio) &&
      pageAspectRatio > 0
    ) {
      return;
    }
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
  }, [engine, pageAspectRatio, pageIndex, perfEnabled]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== layout.width || height !== layout.height) {
      setLayout({ width, height });
    }
  };

  const addAnnotationAt = useCallback(
    (
      x: number,
      y: number,
      width: number,
      height: number,
      type: Annotation["type"],
      extras?: Partial<
        Pick<
          Annotation,
          "rects" | "path" | "content" | "opacity" | "strokeWidth"
        >
      >
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
        opacity: extras?.opacity ?? useViewerStore.getState().annotationOpacity,
        strokeWidth: extras?.strokeWidth,
        content:
          extras?.content ??
          (type === "text" || type === "comment" ? "" : undefined),
        createdAt: Date.now(),
      });
    },
    [addAnnotation, annotationColor, logSelectionPerf, pageIndex]
  );

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
    if (resolvedActiveTool === "ink") return;
    inkDrawingActiveRef.current = false;
    setIsInkDrawing(false);
    setInkPoints([]);
    inkPointsRef.current = [];
  }, [resolvedActiveTool]);

  const viewportWidth =
    providedPageViewportWidth ?? availableWidth ?? windowWidth;
  const selectionEnabled =
    Platform.OS === "web" ||
    (isNative &&
      shouldEnableSelectionDrag({
        activeTool: resolvedActiveTool,
        interactionMode: resolvedInteractionMode,
      }));
  const inkEnabled = isNative && resolvedActiveTool === "ink";

  const stopSelectionAutoscroll = useCallback(() => {
    if (selectionAutoscrollIntervalRef.current) {
      clearInterval(selectionAutoscrollIntervalRef.current);
      selectionAutoscrollIntervalRef.current = null;
    }
  }, []);

  const clearSelection = useCallback(() => {
    stopSelectionAutoscroll();
    selectionDragPointRef.current = null;
    setSelectionDragState(false);
    setSelectionRect(null);
    selectionRectRef.current = null;
    setSelectionRects([]);
    setSelectionBounds(null);
    selectionBoundsRef.current = null;
    setSelectionText("");
    setIsSelecting(false);
    selectionStart.current = null;
    selectionBoundsStart.current = null;
    setSelectionActive(false);
  }, [setSelectionActive, setSelectionDragState, stopSelectionAutoscroll]);

  useEffect(() => {
    if (resolvedActiveTool === "select") return;
    clearSelection();
  }, [clearSelection, resolvedActiveTool]);

  useEffect(
    () => () => {
      stopSelectionAutoscroll();
      setSelectionDragState(false);
    },
    [setSelectionDragState, stopSelectionAutoscroll]
  );

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

  const cancelSelectionDrag = useCallback(() => {
    stopSelectionAutoscroll();
    selectionDragPointRef.current = null;
    setSelectionDragState(false);
    setIsSelecting(false);
    selectionStart.current = null;
    selectionRectRef.current = null;
    setSelectionRect(null);
  }, [setSelectionDragState, stopSelectionAutoscroll]);

  const updateSelectionRectFromPoint = useCallback(
    (x: number, y: number) => {
      const start = selectionStart.current;
      if (!start || !layout.width || !layout.height) return;
      const left = Math.max(0, Math.min(start.x, x));
      const top = Math.max(0, Math.min(start.y, y));
      const right = Math.min(layout.width, Math.max(start.x, x));
      const bottom = Math.min(layout.height, Math.max(start.y, y));
      const rect = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
      selectionRectRef.current = rect;
      setSelectionRect(rect);
    },
    [layout.height, layout.width]
  );

  const applySelectionEdgeAutoscroll = useCallback(() => {
    const point = selectionDragPointRef.current;
    if (!point || !selectionStart.current || !layout.width || !layout.height) {
      stopSelectionAutoscroll();
      return;
    }

    const appliedDy =
      requestSelectionVerticalAutoscroll?.(point.absoluteY) ?? 0;
    if (appliedDy === 0) {
      stopSelectionAutoscroll();
      return;
    }

    const nextX = point.x;
    const nextY = clamp(point.y + appliedDy, 0, layout.height);
    selectionDragPointRef.current = {
      absoluteY: point.absoluteY,
      x: nextX,
      y: nextY,
    };
    updateSelectionRectFromPoint(nextX, nextY);
  }, [
    layout.height,
    layout.width,
    requestSelectionVerticalAutoscroll,
    stopSelectionAutoscroll,
    updateSelectionRectFromPoint,
  ]);

  const ensureSelectionAutoscroll = useCallback(() => {
    if (selectionAutoscrollIntervalRef.current) return;
    selectionAutoscrollIntervalRef.current = setInterval(
      applySelectionEdgeAutoscroll,
      SELECTION_AUTOSCROLL_INTERVAL_MS
    );
  }, [applySelectionEdgeAutoscroll]);

  const beginSelectionDrag = useCallback(
    (x: number, y: number, absoluteY: number) => {
      if (
        !selectionEnabled ||
        !layout.width ||
        !layout.height ||
        selectionRects.length > 0 ||
        selectionBounds
      ) {
        return;
      }
      const start = {
        x: clamp(x, 0, layout.width),
        y: clamp(y, 0, layout.height),
      };
      selectionStart.current = start;
      selectionDragPointRef.current = { absoluteY, ...start };
      setSelectionDragState(true);
      setIsSelecting(true);
      const rect = { x: start.x, y: start.y, width: 0, height: 0 };
      selectionRectRef.current = rect;
      setSelectionRect(rect);
    },
    [
      layout.height,
      layout.width,
      selectionBounds,
      selectionEnabled,
      selectionRects.length,
      setSelectionDragState,
    ]
  );

  const updateSelectionDrag = useCallback(
    (x: number, y: number, absoluteY: number) => {
      if (!selectionEnabled || !selectionStart.current) return;
      const nextX = clamp(x, 0, layout.width);
      const nextY = clamp(y, 0, layout.height);
      selectionDragPointRef.current = {
        absoluteY,
        x: nextX,
        y: nextY,
      };
      updateSelectionRectFromPoint(nextX, nextY);
      ensureSelectionAutoscroll();
    },
    [
      ensureSelectionAutoscroll,
      layout.height,
      layout.width,
      selectionEnabled,
      updateSelectionRectFromPoint,
    ]
  );

  const finishSelectionDrag = useCallback(async () => {
    stopSelectionAutoscroll();
    selectionDragPointRef.current = null;
    setSelectionDragState(false);

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
  }, [
    clearSelection,
    layout.height,
    layout.width,
    selectionEnabled,
    setSelectionDragState,
    stopSelectionAutoscroll,
  ]);

  const handleDoubleTap = useCallback(
    (x: number, y: number) => {
      if (shouldSuppressPressAfterPinch(lastPinchEndedAt)) {
        return;
      }
      if (
        !isNative ||
        activeTool !== "select" ||
        selectionRects.length > 0 ||
        selectionBounds
      ) {
        return;
      }
      void selectAtPoint(x, y);
    },
    [
      activeTool,
      isNative,
      lastPinchEndedAt,
      selectionBounds,
      selectionRects.length,
    ]
  );

  const handlePress = (event: GestureResponderEvent) => {
    if (shouldSuppressPressAfterPinch(lastPinchEndedAt)) {
      return;
    }
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
    if (resolvedActiveTool !== "select" || resolvedInteractionMode !== "pan") {
      return;
    }
    onPageTap?.();
  };

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
    const { annotationOpacity, inkStrokeWidth, annotationColor: currentColor } =
      useViewerStore.getState();
    clearSelection();
    inkDrawingActiveRef.current = true;
    currentInkStyleRef.current = {
      color: currentColor,
      opacity: annotationOpacity,
      strokeWidth: inkStrokeWidth,
    };
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
    inkDrawingActiveRef.current = false;
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
      {
        path: points,
        strokeWidth: currentInkStyleRef.current.strokeWidth,
        opacity: currentInkStyleRef.current.opacity,
      }
    );
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => {
          if (isNative) return false;
          const touches = event.nativeEvent.touches ?? [];
          if (touches.length !== 1) return false;
          return inkEnabled;
        },
        onMoveShouldSetPanResponder: (event) => {
          if (isNative) return false;
          const touches = event.nativeEvent.touches ?? [];
          if (touches.length !== 1) return false;
          return selectionEnabled || inkEnabled;
        },
        onPanResponderGrant: (event) => {
          if (inkEnabled) {
            beginInkDrawing(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );
            return;
          }
          beginSelectionDrag(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
            event.nativeEvent.pageY ?? event.nativeEvent.locationY
          );
        },
        onPanResponderMove: (event) => {
          if (inkEnabled) {
            pushInkPoint(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY
            );
            return;
          }
          updateSelectionDrag(
            event.nativeEvent.locationX,
            event.nativeEvent.locationY,
            event.nativeEvent.pageY ?? event.nativeEvent.locationY
          );
        },
        onPanResponderRelease: async () => {
          if (inkEnabled) {
            finishInkDrawing();
            return;
          }
          await finishSelectionDrag();
        },
        onPanResponderTerminate: () => {
          if (inkEnabled) {
            finishInkDrawing();
            return;
          }
          cancelSelectionDrag();
        },
      }),
    [
      beginSelectionDrag,
      cancelSelectionDrag,
      finishSelectionDrag,
      isNative,
      inkEnabled,
      beginInkDrawing,
      finishInkDrawing,
      pushInkPoint,
      selectionEnabled,
      updateSelectionDrag,
    ]
  );

  const selectionGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(
          isNative &&
            selectionEnabled &&
            selectionRects.length === 0 &&
            !selectionBounds
        )
        .maxPointers(1)
        .minDistance(4)
        .runOnJS(true)
        .onStart((event) => {
          beginSelectionDrag(event.x, event.y, event.absoluteY);
        })
        .onUpdate((event) => {
          updateSelectionDrag(event.x, event.y, event.absoluteY);
        })
        .onEnd(() => {
          void finishSelectionDrag();
        })
        .onFinalize(() => {
          if (selectionDragActiveRef.current) {
            cancelSelectionDrag();
          }
        }),
    [
      beginSelectionDrag,
      cancelSelectionDrag,
      finishSelectionDrag,
      isNative,
      selectionBounds,
      selectionEnabled,
      selectionRects.length,
      updateSelectionDrag,
    ]
  );

  const inkGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(isNative && inkEnabled)
        .maxPointers(1)
        .minDistance(0)
        .runOnJS(true)
        .onStart((event) => {
          beginInkDrawing(event.x, event.y);
        })
        .onUpdate((event) => {
          pushInkPoint(event.x, event.y);
        })
        .onEnd(() => {
          finishInkDrawing();
        })
        .onFinalize(() => {
          if (inkDrawingActiveRef.current) {
            finishInkDrawing();
          }
        }),
    [beginInkDrawing, finishInkDrawing, inkEnabled, isNative, pushInkPoint]
  );

  const commentTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(isNative && resolvedActiveTool === "comment")
        .maxDistance(16)
        .runOnJS(true)
        .onEnd((event, success) => {
          if (!success) return;
          const normalized = toNormalizedPoint(event.x, event.y);
          if (!normalized) return;
          addAnnotationAt(
            clamp01(normalized.x - 0.02),
            clamp01(normalized.y - 0.02),
            0.08,
            0.06,
            "comment"
          );
        }),
    buildCommentTapGestureDeps({
      isNative,
      resolvedActiveTool,
      layoutWidth: layout.width,
      layoutHeight: layout.height,
      annotationColor,
      annotationOpacity,
      inkStrokeWidth,
      addAnnotationAt,
    })
  );

  const doubleTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(isNative && resolvedActiveTool === "select")
        .numberOfTaps(2)
        .maxDistance(24)
        .maxDelay(280)
        .maxDuration(250)
        .runOnJS(true)
        .onEnd((event, success) => {
          if (!success) return;
          handleDoubleTap(event.x, event.y);
        }),
    [handleDoubleTap, isNative, resolvedActiveTool]
  );

  const contentGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        selectionGesture,
        inkGesture,
        commentTapGesture,
        doubleTapGesture
      ),
    [commentTapGesture, doubleTapGesture, inkGesture, selectionGesture]
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
    typeof pageAspectRatio === "number" &&
    Number.isFinite(pageAspectRatio) &&
    pageAspectRatio > 0
      ? pageAspectRatio
      : pageSize && pageSize.width > 0 && pageSize.height > 0
      ? pageSize.width / pageSize.height
      : 0.77;
  const containerWidth = availableWidth ?? windowWidth;
  const baseWidth = resolvePdfBasePageWidth({
    viewportWidth: containerWidth,
    horizontalPadding,
  });
  const pageWidth = isNative ? baseWidth * zoom : baseWidth;
  const pageHeight = pageWidth / aspectRatio;
  const pageFrameWidth = Math.max(
    viewportWidth,
    pageWidth + horizontalPadding * 2
  );
  const pageFrameHorizontalInset = resolvePdfCenteredInset({
    viewportLength: pageFrameWidth,
    contentLength: pageWidth,
  });
  return (
    <View
      style={[
        styles.scrollContent,
        {
          width: pageFrameWidth,
          paddingHorizontal: pageFrameHorizontalInset,
        },
      ]}
    >
      <GestureDetector gesture={contentGesture}>
        <Pressable
          {...panResponder.panHandlers}
          style={[
            styles.container,
            {
              width: pageWidth,
              height: pageHeight,
              marginBottom: spacing,
            },
          ]}
          onLayout={handleLayout}
          onTouchStart={(event) => logRawTouchDebug("start", event)}
          onTouchMove={(event) => logRawTouchDebug("move", event)}
          onTouchEnd={(event) => logRawTouchDebug("end", event)}
          onTouchCancel={(event) => logRawTouchDebug("cancel", event)}
          onPress={handlePress}
          testID={`papyrus-page-${pageIndex + 1}`}
        >
          <PageViewComponent
            ref={viewRef}
            pointerEvents="none"
            pageTheme={pageTheme}
            style={styles.page}
          />
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
                  stroke={withAlpha(
                    currentInkStyleRef.current.color,
                    currentInkStyleRef.current.opacity
                  )}
                  strokeWidth={currentInkStyleRef.current.strokeWidth}
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
              const isMarkup = TEXT_MARKUP_TOOLS.has(
                ann.type as TextMarkupType
              );
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
                                {
                                  backgroundColor: withAlpha(
                                    ann.color,
                                    ann.opacity ?? 0.38
                                  ),
                                },
                              ]}
                            />
                          );
                        }

                        if (ann.type === "underline") {
                          return (
                            <View
                              key={`${ann.id}-mark-${rectIndex}`}
                              pointerEvents="none"
                              style={[
                                styles.annotationLineContainer,
                                rectStyle,
                              ]}
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
                              style={[
                                styles.annotationLineContainer,
                                rectStyle,
                              ]}
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
                        stroke={withAlpha(ann.color, ann.opacity ?? 1)}
                        strokeWidth={ann.strokeWidth ?? 0.006}
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
      </GestureDetector>
    </View>
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
  previous.pageViewportWidth === next.pageViewportWidth &&
  previous.horizontalPadding === next.horizontalPadding &&
  previous.spacing === next.spacing &&
  previous.onSelectionDragActiveChange === next.onSelectionDragActiveChange &&
  previous.gestureScrollLockActive === next.gestureScrollLockActive &&
  previous.lastPinchEndedAt === next.lastPinchEndedAt &&
  previous.requestSelectionVerticalAutoscroll ===
    next.requestSelectionVerticalAutoscroll;

export default memo(PageRenderer, arePageRendererPropsEqual);
