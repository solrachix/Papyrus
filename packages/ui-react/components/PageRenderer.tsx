import React, { useEffect, useMemo, useRef, useState } from "react";
import { useViewerStore, papyrusEvents } from "@papyrus-sdk/core";
import {
  DocumentEngine,
  Annotation,
  PapyrusEventType,
} from "@papyrus-sdk/types";

interface PageRendererProps {
  engine: DocumentEngine;
  pageIndex: number;
  availableWidth?: number;
  onMeasuredSize?: (
    pageIndex: number,
    size: { width: number; height: number }
  ) => void;
}

const SCALE_PRECISION = 1000;

const PageRenderer: React.FC<PageRendererProps> = ({
  engine,
  pageIndex,
  availableWidth,
  onMeasuredSize,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const htmlLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

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
    if (!availableWidth || !pageSize?.width) return 1;
    const targetWidth = Math.max(0, availableWidth - 48);
    if (!targetWidth) return 1;
    const rawScale = Math.min(1, targetWidth / pageSize.width);
    return Math.round(rawScale * SCALE_PRECISION) / SCALE_PRECISION;
  }, [availableWidth, pageSize]);

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
      const renderTarget = isElementRender
        ? htmlLayerRef.current
        : canvasRef.current;
      if (!renderTarget || !textLayerRef.current) return;
      setLoading(true);

      try {
        const RENDER_SCALE = 2.0;
        const canvasRenderScale = isElementRender
          ? 1.0
          : RENDER_SCALE * fitScale;
        const textRenderScale = isElementRender ? 1.0 : fitScale;
        if (!isElementRender && canvasRef.current && displaySize) {
          // Apply CSS size before rendering to avoid temporary horizontal jumps.
          canvasRef.current.style.width = `${displaySize.width}px`;
          canvasRef.current.style.height = `${displaySize.height}px`;
        }

        // A UI solicita renderização passando o "alvo" (Canvas/Div).
        // Ela não sabe se o motor usa PDF.js ou se está gerando um bitmap.
        await engine.renderPage(pageIndex, renderTarget, canvasRenderScale);

        if (!isElementRender && !pageSize && canvasRef.current) {
          const denom = canvasRenderScale * Math.max(zoom, 0.01);
          if (denom > 0) {
            setPageSize({
              width: canvasRef.current.width / denom,
              height: canvasRef.current.height / denom,
            });
          }
        }

        if (!active || !textLayerRef.current) return;
        if (!isElementRender) {
          textLayerRef.current.innerHTML = "";
          await engine.renderTextLayer(
            pageIndex,
            textLayerRef.current,
            textRenderScale
          );
        }

        if (!active || !textLayerRef.current) return;
        if (!isElementRender && displaySize) {
          if (canvasRef.current) {
            canvasRef.current.style.width = `${displaySize.width}px`;
            canvasRef.current.style.height = `${displaySize.height}px`;
          }
          textLayerRef.current.style.width = `${displaySize.width}px`;
          textLayerRef.current.style.height = `${displaySize.height}px`;
        }
        setTextLayerVersion((v) => v + 1);
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
    zoom,
    rotation,
    isElementRender,
    fitScale,
    displaySize,
    pageSize,
  ]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    setSelectionMenu(null);
    if (activeTool === "ink") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setIsInkDrawing(true);
      setInkPoints([{ x, y }]);
      return;
    }
    if (canSelectText) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isInkDrawing) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      setInkPoints((prev) => [...prev, { x, y }]);
      return;
    }
    if (!isDragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setCurrentRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y),
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
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
            const anchorX = (rect.x + rect.width) * containerRect.width;
            const anchorY = rect.y * containerRect.height;
            setSelectionMenu({
              rects: mergedRects,
              rect,
              text: selectionText,
              anchor: {
                x: Math.max(12, Math.min(containerRect.width - 12, anchorX)),
                y: Math.max(12, anchorY - 32),
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

  return (
    <div
      ref={containerRef}
      className={`relative inline-block shadow-2xl bg-white mb-10 ${
        canSelectText ? "" : "no-select cursor-crosshair"
      }`}
      style={{ scrollMarginTop: "20px", minHeight: "100px" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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

      {selectionMenu && (
        <div
          className="absolute z-[60] flex items-center gap-1 rounded-full border px-2 py-1 shadow-xl bg-white/95 backdrop-blur-md text-gray-700"
          style={{ left: selectionMenu.anchor.x, top: selectionMenu.anchor.y }}
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
        </div>
      )}

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
              onSelect={() => setSelectedAnnotation(ann.id)}
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
}> = ({ ann, isSelected, accentColor, onDelete, onSelect }) => {
  const isText = ann.type === "text" || ann.type === "comment";
  const isHighlight = ann.type === "highlight";
  const isMarkup =
    ann.type === "highlight" ||
    ann.type === "underline" ||
    ann.type === "squiggly" ||
    ann.type === "strikeout";
  const rects = ann.rects && ann.rects.length > 0 ? ann.rects : [ann.rect];
  const isInk = ann.type === "ink" && ann.path && ann.path.length > 1;

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
      {isText && isSelected && (
        <div className="absolute top-full mt-2 w-64 bg-white shadow-2xl rounded-xl p-4 border border-gray-100 z-50">
          <textarea
            className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-800 text-xs font-medium"
            placeholder="Escreva sua nota..."
            rows={3}
            defaultValue={ann.content || ""}
            autoFocus
          />
        </div>
      )}
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
