import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useViewerStore, papyrusEvents } from "@papyrus-sdk/core";
import { resolveContextualUiPosition } from "./contextualUi";
import {
  DocumentEngine,
  Annotation,
  PapyrusEventType,
} from "@papyrus-sdk/types";

interface PageRendererProps {
  engine: DocumentEngine;
  pageIndex: number;
  availableWidth?: number;
  availableHeight?: number;
  onMeasuredSize?: (
    pageIndex: number,
    size: { width: number; height: number }
  ) => void;
  onRenderReady?: (pageIndex: number, renderedZoom: number) => void;
}

const SCALE_PRECISION = 1000;

const PageRenderer: React.FC<PageRendererProps> = ({
  engine,
  pageIndex,
  availableWidth,
  availableHeight,
  onMeasuredSize,
  onRenderReady,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const htmlLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const onRenderReadyRef = useRef(onRenderReady);
  onRenderReadyRef.current = onRenderReady;
  const skipNextAnnotationSelectRef = useRef(false);
  const skipSelectResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [textLayerVersion, setTextLayerVersion] = useState(0);
  const [selectionMenu, setSelectionMenu] = useState<{
    rects: { x: number; y: number; width: number; height: number }[];
    rect: { x: number; y: number; width: number; height: number };
    text: string;
    anchor: { x: number; y: number };
  } | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [isInkDrawing, setIsInkDrawing] = useState(false);
  const [inkPoints, setInkPoints] = useState<{ x: number; y: number }[]>([]);

  const {
    zoom,
    rotation,
    pageTheme,
    scrollToPageSignal,
    setDocumentState,
    annotations,
    addAnnotation,
    addAnnotationReply,
    updateAnnotation,
    activeTool,
    removeAnnotation,
    selectedAnnotationId,
    setSelectedAnnotation,
    accentColor,
    annotationColor,
    searchQuery,
    searchResults,
    activeSearchIndex,
  } = useViewerStore();
  const renderTargetType = engine.getRenderTargetType?.() ?? "canvas";
  const isElementRender = renderTargetType === "element";
  const isLandscape =
    typeof availableWidth === "number" &&
    typeof availableHeight === "number" &&
    availableWidth > availableHeight;
  const isLandscapeShort =
    isLandscape &&
    typeof availableHeight === "number" &&
    availableHeight <= 500;
  const isMobileElementViewport =
    isElementRender &&
    typeof availableWidth === "number" &&
    (availableWidth <= 768 || isLandscapeShort);
  const renderZoomDependency = isElementRender ? 1 : zoom;
  const renderRotationDependency = isElementRender ? 0 : rotation;
  const textMarkupTools = new Set([
    "highlight",
    "underline",
    "squiggly",
    "strikeout",
  ]);
  const canSelectText =
    activeTool === "select" || textMarkupTools.has(activeTool);
  const hasSearchHits = useMemo(
    () =>
      Boolean(searchQuery?.trim()) &&
      searchResults.some((res) => res.pageIndex === pageIndex),
    [searchQuery, searchResults, pageIndex]
  );

  const suppressNextAnnotationSelect = () => {
    skipNextAnnotationSelectRef.current = true;
    if (skipSelectResetTimerRef.current) {
      clearTimeout(skipSelectResetTimerRef.current);
    }
    skipSelectResetTimerRef.current = setTimeout(() => {
      skipNextAnnotationSelectRef.current = false;
      skipSelectResetTimerRef.current = null;
    }, 0);
  };

  useEffect(
    () => () => {
      if (skipSelectResetTimerRef.current) {
        clearTimeout(skipSelectResetTimerRef.current);
      }
    },
    []
  );

  useLayoutEffect(() => {
    if (!selectionMenu || typeof window === "undefined") {
      setSelectionMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const menu = selectionMenuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      setSelectionMenuPosition(
        resolveContextualUiPosition(
          selectionMenu.anchor,
          { width: rect.width, height: rect.height },
          { width: window.innerWidth, height: window.innerHeight }
        )
      );
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [selectionMenu]);

  useEffect(() => {
    if (!isElementRender) return;
    // Single-viewport EPUB reuses one renderer; clear stale size between sections.
    setPageSize(null);
  }, [isElementRender, pageIndex]);

  useEffect(() => {
    let active = true;
    const loadSize = async () => {
      try {
        const size = await engine.getPageDimensions(pageIndex);
        if (!active) return;
        if (size.width > 0 && size.height > 0) {
          setPageSize(size);
        }
      } catch {
        // Ignore size errors to avoid blocking rendering.
      }
    };
    loadSize();
    return () => {
      active = false;
    };
  }, [engine, pageIndex]);

  const fitScale = useMemo(() => {
    if (isElementRender && isMobileElementViewport) return 1;
    if (!availableWidth || !pageSize?.width) return 1;
    const targetWidth = Math.max(0, availableWidth - 48);
    if (!targetWidth) return 1;
    const rawScale = Math.min(1, targetWidth / pageSize.width);
    return Math.round(rawScale * SCALE_PRECISION) / SCALE_PRECISION;
  }, [isElementRender, isMobileElementViewport, availableWidth, pageSize]);

  const displaySize = useMemo(() => {
    if (!pageSize) return null;
    const scale = zoom * fitScale;
    return {
      width: Math.max(1, Math.round(pageSize.width * scale)),
      height: Math.max(1, Math.round(pageSize.height * scale)),
    };
  }, [pageSize, zoom, fitScale]);

  useEffect(() => {
    if (!displaySize || !onMeasuredSize) return;
    onMeasuredSize(pageIndex, {
      width: displaySize.width,
      height: displaySize.height,
    });
  }, [displaySize, onMeasuredSize, pageIndex]);

  useEffect(() => {
    if (scrollToPageSignal === pageIndex) {
      setDocumentState({ scrollToPageSignal: null });
    }
  }, [scrollToPageSignal, pageIndex, setDocumentState]);

  useEffect(() => {
    let active = true;
    const render = async () => {
      const visibleCanvas = canvasRef.current;
      const renderTarget = isElementRender
        ? htmlLayerRef.current
        : document.createElement("canvas");
      const nextTextLayer = document.createElement("div");
      if (!renderTarget || !textLayerRef.current) return;
      setLoading(true);

      try {
        const RENDER_SCALE = 2.0;
        const canvasRenderScale = isElementRender
          ? 1.0
          : RENDER_SCALE * fitScale;
        const textRenderScale = isElementRender ? 1.0 : fitScale;
        // A UI solicita renderização passando o "alvo" (Canvas/Div).
        // Ela não sabe se o motor usa PDF.js ou se está gerando um bitmap.
        await engine.renderPage(pageIndex, renderTarget, canvasRenderScale);
        const measuredSize = await engine.getPageDimensions(pageIndex);
        if (measuredSize.width > 0 && measuredSize.height > 0 && active) {
          setPageSize((prev) => {
            if (
              prev &&
              prev.width === measuredSize.width &&
              prev.height === measuredSize.height
            ) {
              return prev;
            }
            return measuredSize;
          });
        }

        if (!isElementRender && !pageSize && renderTarget instanceof HTMLCanvasElement) {
          const denom = canvasRenderScale * Math.max(zoom, 0.01);
          if (denom > 0) {
            setPageSize({
              width: renderTarget.width / denom,
              height: renderTarget.height / denom,
            });
          }
        }

        if (!active || !textLayerRef.current) return;
        if (!isElementRender) {
          await engine.renderTextLayer(
            pageIndex,
            nextTextLayer,
            textRenderScale
          );
        }

        if (!active || !textLayerRef.current) return;
        if (!isElementRender && visibleCanvas && renderTarget instanceof HTMLCanvasElement) {
          visibleCanvas.width = renderTarget.width;
          visibleCanvas.height = renderTarget.height;
          visibleCanvas.getContext("2d")?.drawImage(renderTarget, 0, 0);
        }
        if (!isElementRender) {
          textLayerRef.current.replaceChildren(...Array.from(nextTextLayer.childNodes));
        }
        if (!isElementRender && displaySize) {
          if (visibleCanvas) {
            visibleCanvas.style.width = `${displaySize.width}px`;
            visibleCanvas.style.height = `${displaySize.height}px`;
          }
          textLayerRef.current.style.width = `${displaySize.width}px`;
          textLayerRef.current.style.height = `${displaySize.height}px`;
        }
        setTextLayerVersion((v) => v + 1);
        onRenderReadyRef.current?.(pageIndex, zoom);
      } catch (err) {
        if (!active) return;
        console.error("[Papyrus] Falha na renderização:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    render();
    return () => {
      active = false;
    };
  }, [
    engine,
    pageIndex,
    isElementRender,
    availableWidth,
    fitScale,
    displaySize,
    pageSize,
    renderZoomDependency,
    renderRotationDependency,
  ]);

  useEffect(() => {
    if (!isElementRender || pageSize) return;
    const target = htmlLayerRef.current;
    if (!target) return;
    const measuredWidth = target.clientWidth || target.scrollWidth || 0;
    const measuredHeight = target.clientHeight || target.scrollHeight || 0;
    if (measuredWidth > 0 && measuredHeight > 0) {
      setPageSize({ width: measuredWidth, height: measuredHeight });
    }
  }, [isElementRender, pageSize, textLayerVersion]);

  useEffect(() => {
    if (isElementRender) return;
    const layer = textLayerRef.current;
    if (!layer) return;
    const query = searchQuery?.trim().toLowerCase();
    const existingMarks = Array.from(
      layer.querySelectorAll("mark.papyrus-search-hit")
    ) as HTMLElement[];
    existingMarks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
    if (!query || !hasSearchHits) return;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue ?? "";
        if (!text.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) {
      nodes.push(walker.currentNode as Text);
    }
    nodes.forEach((textNode) => {
      const text = textNode.nodeValue ?? "";
      const lower = text.toLowerCase();
      if (!lower.includes(query)) return;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let index = lower.indexOf(query, cursor);
      while (index !== -1) {
        if (index > cursor) {
          fragment.appendChild(
            document.createTextNode(text.slice(cursor, index))
          );
        }
        const mark = document.createElement("mark");
        mark.className = "papyrus-search-hit";
        mark.textContent = text.slice(index, index + query.length);
        fragment.appendChild(mark);
        cursor = index + query.length;
        index = lower.indexOf(query, cursor);
      }
      if (cursor < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(cursor)));
      }
      const parent = textNode.parentNode;
      if (parent) parent.replaceChild(fragment, textNode);
    });
  }, [
    searchQuery,
    hasSearchHits,
    pageIndex,
    isElementRender,
    activeSearchIndex,
    textLayerVersion,
  ]);

  const getTouchPoint = (event: React.TouchEvent) => {
    const touch = event.touches[0] ?? event.changedTouches[0];
    if (!touch) return null;
    return { x: touch.clientX, y: touch.clientY };
  };

  const handlePointerDown = (
    clientX: number,
    clientY: number,
    target: HTMLElement | null
  ) => {
    const clickedInsideAnnotation = Boolean(
      target?.closest("[data-papyrus-annotation-id]")
    );
    const clickedSelectionMenu = Boolean(
      target?.closest("[data-papyrus-selection-menu]")
    );
    if (!clickedInsideAnnotation && !clickedSelectionMenu) {
      setSelectedAnnotation(null);
    }
    setSelectionMenu(null);
    if (activeTool === "ink") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      setIsInkDrawing(true);
      setInkPoints([{ x, y }]);
      return;
    }
    if (canSelectText) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setStartPos({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (isInkDrawing) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      setInkPoints((prev) => [...prev, { x, y }]);
      return;
    }
    if (!isDragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = clientX - rect.left;
    const currentY = clientY - rect.top;

    setCurrentRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y),
    });
  };

  const handlePointerUp = () => {
    if (isInkDrawing) {
      setIsInkDrawing(false);
      if (inkPoints.length > 1) {
        const xs = inkPoints.map((p) => p.x);
        const ys = inkPoints.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const width = Math.max(maxX - minX, 0.0005);
        const height = Math.max(maxY - minY, 0.0005);
        const path = inkPoints.map((p) => ({
          x: Math.max(0, Math.min(1, p.x)),
          y: Math.max(0, Math.min(1, p.y)),
        }));
        suppressNextAnnotationSelect();
        addAnnotation({
          id: Math.random().toString(36).substr(2, 9),
          pageIndex,
          type: "ink",
          rect: { x: minX, y: minY, width, height },
          path,
          color: annotationColor,
          createdAt: Date.now(),
        });
      }
      setInkPoints([]);
      return;
    }

    const selection = window.getSelection();
    const selectionText = selection?.toString().trim() ?? "";
    if (
      selectionText &&
      textLayerRef.current &&
      containerRef.current &&
      selection &&
      selection.rangeCount > 0
    ) {
      const range = selection.getRangeAt(0);
      if (textLayerRef.current.contains(range.commonAncestorContainer)) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const clientRects = Array.from(range.getClientRects());
        const rects = clientRects
          .filter((r) => r.width > 1 && r.height > 1)
          .map((r) => {
            const x = (r.left - containerRect.left) / containerRect.width;
            const y = (r.top - containerRect.top) / containerRect.height;
            const width = r.width / containerRect.width;
            const height = r.height / containerRect.height;
            return {
              x: Math.max(0, Math.min(1, x)),
              y: Math.max(0, Math.min(1, y)),
              width: Math.max(0, Math.min(1, width)),
              height: Math.max(0, Math.min(1, height)),
            };
          });
        const uniqueRects = rects.filter((rect, index, list) => {
          const key = `${Math.round(rect.x * 10000)}-${Math.round(
            rect.y * 10000
          )}-${Math.round(rect.width * 10000)}-${Math.round(
            rect.height * 10000
          )}`;
          return (
            list.findIndex(
              (r) =>
                `${Math.round(r.x * 10000)}-${Math.round(
                  r.y * 10000
                )}-${Math.round(r.width * 10000)}-${Math.round(
                  r.height * 10000
                )}` === key
            ) === index
          );
        });
        const mergedRects = uniqueRects.reduce(
          (acc: typeof uniqueRects, rect) => {
            const target = acc.find((r) => {
              const closeY =
                Math.abs(r.y - rect.y) < 0.002 &&
                Math.abs(r.height - rect.height) < 0.002;
              const overlaps =
                rect.x <= r.x + r.width + 0.002 &&
                rect.x + rect.width >= r.x - 0.002;
              return closeY && overlaps;
            });
            if (!target) {
              acc.push({ ...rect });
              return acc;
            }
            const left = Math.min(target.x, rect.x);
            const right = Math.max(
              target.x + target.width,
              rect.x + rect.width
            );
            target.x = left;
            target.width = right - left;
            return acc;
          },
          []
        );
        if (mergedRects.length) {
          const xs = mergedRects.map((r) => r.x);
          const ys = mergedRects.map((r) => r.y);
          const xe = mergedRects.map((r) => r.x + r.width);
          const ye = mergedRects.map((r) => r.y + r.height);
          const rect = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xe) - Math.min(...xs),
            height: Math.max(...ye) - Math.min(...ys),
          };
          if (textMarkupTools.has(activeTool)) {
            suppressNextAnnotationSelect();
            addAnnotation({
              id: Math.random().toString(36).substr(2, 9),
              pageIndex,
              type: activeTool as Annotation["type"],
              rect,
              rects: mergedRects,
              color: annotationColor,
              content: selectionText,
              createdAt: Date.now(),
            });
            selection.removeAllRanges();
            setSelectionMenu(null);
            return;
          }
          if (activeTool === "select") {
            const anchorX =
              containerRect.left + (rect.x + rect.width) * containerRect.width;
            const anchorY = containerRect.top + rect.y * containerRect.height - 32;
            setSelectionMenu({
              rects: mergedRects,
              rect,
              text: selectionText,
              anchor: {
                x: anchorX,
                y: anchorY,
              },
            });
          }
        }
      }
    }

    if (isDragging) {
      setIsDragging(false);
      if (currentRect.w > 5 && currentRect.h > 5) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          if (activeTool !== "text" && activeTool !== "comment") {
            suppressNextAnnotationSelect();
          }
          addAnnotation({
            id: Math.random().toString(36).substr(2, 9),
            pageIndex,
            type: activeTool as any,
            rect: {
              x: currentRect.x / rect.width,
              y: currentRect.y / rect.height,
              width: currentRect.w / rect.width,
              height: currentRect.h / rect.height,
            },
            color: activeTool === "highlight" ? annotationColor : accentColor,
            content:
              activeTool === "text" || activeTool === "comment"
                ? ""
                : undefined,
            createdAt: Date.now(),
          });
        }
      }
      setCurrentRect({ x: 0, y: 0, w: 0, h: 0 });
      return;
    }

    if (activeTool === "select") {
      const selectedText = selection?.toString().trim();
      if (selectedText) {
        papyrusEvents.emit(PapyrusEventType.TEXT_SELECTED, {
          text: selectedText,
          pageIndex: pageIndex,
        });
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    handlePointerDown(e.clientX, e.clientY, e.target as HTMLElement | null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleMouseUp = () => {
    handlePointerUp();
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length > 1) return;
    const point = getTouchPoint(event);
    if (!point) return;
    handlePointerDown(point.x, point.y, event.target as HTMLElement | null);
    if ((activeTool === "ink" || !canSelectText) && event.cancelable) {
      event.preventDefault();
    }
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length > 1) return;
    const point = getTouchPoint(event);
    if (!point) return;
    handlePointerMove(point.x, point.y);
    if ((isInkDrawing || isDragging) && event.cancelable) {
      event.preventDefault();
    }
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (event.touches.length > 0) return;
    handlePointerUp();
  };

  const getPageFilter = () => {
    switch (pageTheme) {
      case "sepia":
        return "sepia(0.6) contrast(1.1) brightness(0.95)";
      case "dark":
        return "invert(0.9) hue-rotate(180deg) brightness(1.1)";
      case "high-contrast":
        return "contrast(2) grayscale(1)";
      default:
        return "none";
    }
  };

  const elementScale = zoom * fitScale;
  const elementBaseWidth = isElementRender
    ? isMobileElementViewport && availableWidth != null
      ? Math.max(260, Math.round(availableWidth))
      : pageSize?.width ?? 640
    : pageSize?.width ?? 640;
  const elementBaseHeight = pageSize?.height ?? (isElementRender ? 700 : 900);
  const elementContainerStyle = isElementRender
    ? {
        width: `${Math.max(1, Math.round(elementBaseWidth * elementScale))}px`,
        height: `${Math.max(
          1,
          Math.round(elementBaseHeight * elementScale)
        )}px`,
      }
    : undefined;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block shadow-2xl bg-white ${
        isMobileElementViewport ? "mb-0" : "mb-10"
      } ${canSelectText ? "" : "no-select cursor-crosshair"}`}
      style={{
        scrollMarginTop: "20px",
        minHeight: "100px",
        overflow: "hidden",
        ...elementContainerStyle,
        touchAction:
          activeTool === "ink" ||
          activeTool === "text" ||
          activeTool === "comment"
            ? "none"
            : "auto",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {loading && (
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center z-10 animate-pulse">
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Sincronizando...
          </span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{
          filter: getPageFilter(),
          display: isElementRender ? "none" : "block",
        }}
        className="block"
      />
      <div
        ref={htmlLayerRef}
        className="block"
        style={{
          filter: getPageFilter(),
          display: isElementRender ? "block" : "none",
          width: `${elementBaseWidth}px`,
          height: `${elementBaseHeight}px`,
          transform: `scale(${elementScale})`,
          transformOrigin: "top left",
        }}
      />

      <div
        ref={textLayerRef}
        className="textLayer"
        style={{
          pointerEvents: isElementRender
            ? "none"
            : canSelectText
            ? "auto"
            : "none",
          display: isElementRender ? "none" : "block",
        }}
      />

      {isDragging && (
        <div
          className="absolute border-2 z-[40] pointer-events-none"
          style={{
            borderColor:
              activeTool === "highlight" ? annotationColor : accentColor,
            backgroundColor:
              activeTool === "highlight"
                ? `${annotationColor}66`
                : `${accentColor}33`,
            mixBlendMode: activeTool === "highlight" ? "multiply" : undefined,
            left: currentRect.x,
            top: currentRect.y,
            width: currentRect.w,
            height: currentRect.h,
          }}
        />
      )}

      {isInkDrawing && inkPoints.length > 1 && (
        <svg
          className="absolute inset-0 pointer-events-none z-[45]"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%" }}
        >
          <path
            d={inkPoints
              .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ")}
            fill="none"
            stroke={annotationColor}
            strokeWidth={0.008}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {selectionMenu && typeof document !== "undefined"
        ? createPortal(
        <div
          ref={selectionMenuRef}
          data-papyrus-selection-menu="true"
          className="fixed z-[60] flex flex-wrap items-center gap-1 rounded-full border px-2 py-1 shadow-xl bg-white/95 backdrop-blur-md text-gray-700"
          style={{
            left: selectionMenuPosition?.left ?? selectionMenu.anchor.x,
            top: selectionMenuPosition?.top ?? selectionMenu.anchor.y,
            maxWidth: "calc(100vw - 16px)",
          }}
        >
          {[
            { id: "highlight", label: "Marcar" },
            { id: "underline", label: "Sublinhar" },
            { id: "squiggly", label: "Onda" },
            { id: "strikeout", label: "Risco" },
          ].map((action) => (
            <button
              key={action.id}
              className="text-[10px] font-bold px-2 py-1 rounded-full hover:bg-gray-100"
              onClick={() => {
                suppressNextAnnotationSelect();
                addAnnotation({
                  id: Math.random().toString(36).substr(2, 9),
                  pageIndex,
                  type: action.id as Annotation["type"],
                  rect: selectionMenu.rect,
                  rects: selectionMenu.rects,
                  content: selectionMenu.text,
                  color: annotationColor,
                  createdAt: Date.now(),
                });
                window.getSelection()?.removeAllRanges();
                setSelectionMenu(null);
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body
      )
        : null}

      <div className="absolute inset-0 pointer-events-none z-20">
        {annotations
          .filter((a) => a.pageIndex === pageIndex)
          .map((ann) => (
            <AnnotationItem
              key={ann.id}
              ann={ann}
              isSelected={selectedAnnotationId === ann.id}
              accentColor={accentColor}
              onDelete={() => removeAnnotation(ann.id)}
              onSelect={() => {
                if (skipNextAnnotationSelectRef.current) {
                  skipNextAnnotationSelectRef.current = false;
                  return;
                }
                setSelectedAnnotation(ann.id);
              }}
              onUpdate={(updates) => updateAnnotation(ann.id, updates)}
              onAddReply={(content) => addAnnotationReply(ann.id, content)}
            />
          ))}
      </div>
    </div>
  );
};

const AnnotationItem: React.FC<{
  ann: Annotation;
  isSelected: boolean;
  accentColor: string;
  onDelete: () => void;
  onSelect: () => void;
  onUpdate: (updates: Partial<Annotation>) => void;
  onAddReply: (content: string) => void;
}> = ({
  ann,
  isSelected,
  accentColor,
  onDelete,
  onSelect,
  onUpdate,
  onAddReply,
}) => {
  const isText = ann.type === "text" || ann.type === "comment";
  const isHighlight = ann.type === "highlight";
  const isMarkup =
    ann.type === "highlight" ||
    ann.type === "underline" ||
    ann.type === "squiggly" ||
    ann.type === "strikeout";
  const rects = ann.rects && ann.rects.length > 0 ? ann.rects : [ann.rect];
  const isInk = ann.type === "ink" && ann.path && ann.path.length > 1;
  const [draftContent, setDraftContent] = useState(ann.content ?? "");
  const [draftReply, setDraftReply] = useState("");
  const annotationItemRef = useRef<HTMLDivElement>(null);
  const annotationPopoverRef = useRef<HTMLDivElement>(null);
  const [annotationPopoverPosition, setAnnotationPopoverPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useEffect(() => {
    setDraftContent(ann.content ?? "");
  }, [ann.id, ann.content]);

  useEffect(() => {
    setDraftReply("");
  }, [ann.id]);

  useLayoutEffect(() => {
    if (!isSelected || !isText || typeof window === "undefined") {
      setAnnotationPopoverPosition(null);
      return;
    }
    const updatePosition = () => {
      const anchor = annotationItemRef.current?.getBoundingClientRect();
      const popover = annotationPopoverRef.current?.getBoundingClientRect();
      if (!anchor || !popover) return;
      setAnnotationPopoverPosition(
        resolveContextualUiPosition(
          { x: anchor.left, y: anchor.bottom + 8 },
          { width: popover.width, height: popover.height },
          { width: window.innerWidth, height: window.innerHeight }
        )
      );
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [ann.id, isSelected, isText]);

  const handleSaveContent = () => {
    const nextContent = draftContent.trim();
    const currentContent = (ann.content ?? "").trim();
    if (nextContent === currentContent) return;
    onUpdate({
      content: nextContent,
      updatedAt: Date.now(),
    });
  };

  const handleReplySubmit = () => {
    const nextReply = draftReply.trim();
    if (!nextReply) return;
    onAddReply(nextReply);
    setDraftReply("");
  };

  const renderMarkupRects = () => {
    if (!isMarkup) return null;
    return rects.map((r, idx) => {
      const left = ann.rect.width
        ? ((r.x - ann.rect.x) / ann.rect.width) * 100
        : 0;
      const top = ann.rect.height
        ? ((r.y - ann.rect.y) / ann.rect.height) * 100
        : 0;
      const width = ann.rect.width ? (r.width / ann.rect.width) * 100 : 100;
      const height = ann.rect.height ? (r.height / ann.rect.height) * 100 : 100;
      if (ann.type === "highlight") {
        return (
          <div
            key={idx}
            className="absolute rounded-sm"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
              backgroundColor: `${ann.color}88`,
              mixBlendMode: "multiply",
            }}
          />
        );
      }

      const lineStyle: React.CSSProperties = {
        left: `${left}%`,
        width: `${width}%`,
      };

      if (ann.type === "underline") {
        return (
          <div
            key={idx}
            className="absolute"
            style={{
              ...lineStyle,
              top: `calc(${top}% + ${height}% - 2px)`,
              height: "2px",
              backgroundColor: ann.color,
            }}
          />
        );
      }

      if (ann.type === "strikeout") {
        return (
          <div
            key={idx}
            className="absolute"
            style={{
              ...lineStyle,
              top: `calc(${top}% + ${height * 0.5}% - 1px)`,
              height: "2px",
              backgroundColor: ann.color,
            }}
          />
        );
      }

      if (ann.type === "squiggly") {
        return (
          <div
            key={idx}
            className="absolute"
            style={{
              ...lineStyle,
              top: `calc(${top}% + ${height}% - 4px)`,
              height: "4px",
              backgroundImage: `linear-gradient(135deg, transparent 75%, ${ann.color} 0), linear-gradient(225deg, transparent 75%, ${ann.color} 0)`,
              backgroundSize: "6px 6px",
              backgroundPosition: "0 0, 3px 3px",
            }}
          />
        );
      }
      return null;
    });
  };

  const renderInk = () => {
    if (!isInk || !ann.path) return null;
    const d = ann.path
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
    return (
      <svg
        className="absolute inset-0"
        viewBox={`${ann.rect.x} ${ann.rect.y} ${ann.rect.width} ${ann.rect.height}`}
        preserveAspectRatio="none"
      >
        <path
          d={d}
          fill="none"
          stroke={ann.color}
          strokeWidth={0.008}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  return (
    <div
      data-papyrus-annotation-id={ann.id}
      ref={annotationItemRef}
      className={`absolute pointer-events-auto transition-all ${
        isSelected ? "shadow-xl z-30" : "z-10"
      }`}
      style={{
        left: `${ann.rect.x * 100}%`,
        top: `${ann.rect.y * 100}%`,
        width: `${ann.rect.width * 100}%`,
        height: `${ann.rect.height * 100}%`,
        backgroundColor:
          !isMarkup && isHighlight ? `${ann.color}88` : "transparent",
        mixBlendMode: !isMarkup && isHighlight ? "multiply" : undefined,
        borderBottom:
          ann.type === "strikeout" && !isMarkup
            ? `2px solid ${ann.color}`
            : "none",
        outline: isSelected ? `2px solid ${accentColor}` : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {renderMarkupRects()}
      {renderInk()}
      {isText && !isSelected && (
        <button
          type="button"
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full flex items-center justify-center shadow-lg"
          style={{
            background:
              "var(--papyrus-surface-2-resolved, var(--papyrus-surface-2, #1f2937))",
            border: "1px solid var(--papyrus-border-resolved, #374151)",
            color: "var(--papyrus-text-resolved, #e5e7eb)",
          }}
          title="Abrir comentario"
          aria-label="Abrir comentario"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 10h.01M12 10h.01M16 10h.01M7 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z"
            />
          </svg>
        </button>
      )}
      {isText && isSelected && typeof document !== "undefined"
        ? createPortal(
        <div
          ref={annotationPopoverRef}
          className="fixed w-72 max-w-[calc(100vw-16px)] rounded-xl p-3 z-50"
          style={{
            left: annotationPopoverPosition?.left ?? 8,
            top: annotationPopoverPosition?.top ?? 8,
            background:
              "var(--papyrus-popover-resolved, var(--papyrus-popover, #ffffff))",
            border: "1px solid var(--papyrus-border-resolved, #d1d5db)",
            color: "var(--papyrus-text-resolved, #111827)",
            boxShadow:
              "0 20px 40px var(--papyrus-shadow-resolved, rgba(0, 0, 0, 0.3))",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
              {ann.type === "comment" ? "Comentario" : "Nota"}
            </span>
            {ann.replies?.length ? (
              <span className="text-[10px] opacity-70">
                {ann.replies.length} resposta{ann.replies.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
          <textarea
            className="w-full rounded-md border p-2 text-xs font-medium resize-none focus:outline-none"
            style={{
              background:
                "var(--papyrus-surface-resolved, var(--papyrus-surface, #ffffff))",
              borderColor: "var(--papyrus-border-resolved, #d1d5db)",
              color: "var(--papyrus-text-resolved, #111827)",
            }}
            placeholder="Escreva seu comentario..."
            rows={3}
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSaveContent();
              }
            }}
            autoFocus
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: accentColor }}
              onClick={(event) => {
                event.stopPropagation();
                handleSaveContent();
              }}
            >
              {(ann.content ?? "").trim() ? "Atualizar" : "Enviar"}
            </button>
          </div>

          {ann.replies && ann.replies.length > 0 ? (
            <div className="mt-3 space-y-2">
              {ann.replies.map((reply) => (
                <div
                  key={reply.id}
                  className="rounded-md border p-2"
                  style={{
                    background:
                      "var(--papyrus-surface-resolved, var(--papyrus-surface, #ffffff))",
                    borderColor: "var(--papyrus-border-resolved, #d1d5db)",
                  }}
                >
                  <p className="text-xs">{reply.content}</p>
                  <p className="mt-1 text-[10px] opacity-70">
                    {new Date(reply.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              className="flex-1 rounded-md border px-2 py-1.5 text-xs focus:outline-none"
              style={{
                background:
                  "var(--papyrus-surface-resolved, var(--papyrus-surface, #ffffff))",
                borderColor: "var(--papyrus-border-resolved, #d1d5db)",
                color: "var(--papyrus-text-resolved, #111827)",
              }}
              placeholder="Responder..."
              value={draftReply}
              onChange={(event) => setDraftReply(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleReplySubmit();
                }
              }}
            />
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: accentColor }}
              onClick={handleReplySubmit}
            >
              Responder
            </button>
          </div>
        </div>,
        document.body
      )
        : null}
      {isSelected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default PageRenderer;
