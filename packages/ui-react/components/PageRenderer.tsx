
import React, { useEffect, useRef, useState } from 'react';
import { useViewerStore, papyrusEvents } from '@papyrus-sdk/core';
import { DocumentEngine, Annotation, PapyrusEventType } from '@papyrus-sdk/types';

interface PageRendererProps { engine: DocumentEngine; pageIndex: number; }

const PageRenderer: React.FC<PageRendererProps> = ({ engine, pageIndex }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const { 
    zoom, rotation, pageTheme, scrollToPageSignal, setDocumentState,
    annotations, addAnnotation, activeTool, removeAnnotation, 
    selectedAnnotationId, setSelectedAnnotation, accentColor
  } = useViewerStore();

  useEffect(() => {
    if (scrollToPageSignal === pageIndex && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDocumentState({ scrollToPageSignal: null });
    }
  }, [scrollToPageSignal, pageIndex, setDocumentState]);

  useEffect(() => {
    let active = true;
    const render = async () => {
      if (!canvasRef.current || !textLayerRef.current) return;
      setLoading(true);
      
      try {
        const RENDER_SCALE = 2.0; 
        
        // A UI solicita renderização passando o "alvo" (Canvas/Div).
        // Ela não sabe se o motor usa PDF.js ou se está gerando um bitmap.
        await engine.renderPage(pageIndex, canvasRef.current, RENDER_SCALE);

        textLayerRef.current.innerHTML = '';
        await engine.renderTextLayer(pageIndex, textLayerRef.current, RENDER_SCALE);

      } catch (err) {
        console.error("[Papyrus] Falha na renderização:", err);
      } finally {
        if (active) setLoading(false);
      }
    };

    render();
    return () => { active = false; };
  }, [engine, pageIndex, zoom, rotation]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'select') return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setIsDragging(true);
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setStartPos({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    setCurrentRect({
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      w: Math.abs(currentX - startPos.x),
      h: Math.abs(currentY - startPos.y)
    });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
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
            color: activeTool === 'highlight' ? '#fbbf24' : activeTool === 'strikeout' ? '#ef4444' : accentColor,
            content: activeTool === 'text' || activeTool === 'comment' ? '' : undefined,
            createdAt: Date.now()
          });
        }
      }
      setCurrentRect({ x: 0, y: 0, w: 0, h: 0 });
      return;
    }

    if (activeTool === 'select') {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (selectedText) {
        papyrusEvents.emit(PapyrusEventType.TEXT_SELECTED, {
          text: selectedText,
          pageIndex: pageIndex
        });
      }
    }
  };

  const getPageFilter = () => {
    switch(pageTheme) {
      case 'sepia': return 'sepia(0.6) contrast(1.1) brightness(0.95)';
      case 'dark': return 'invert(0.9) hue-rotate(180deg) brightness(1.1)';
      case 'high-contrast': return 'contrast(2) grayscale(1)';
      default: return 'none';
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`relative inline-block shadow-2xl bg-white mb-10 transition-all ${activeTool !== 'select' ? 'no-select cursor-crosshair' : ''}`}
      style={{ scrollMarginTop: '20px', minHeight: '100px' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {loading && (
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center z-10 animate-pulse">
           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sincronizando...</span>
        </div>
      )}
      
      <canvas ref={canvasRef} style={{ filter: getPageFilter() }} className="block" />

      <div 
        ref={textLayerRef} 
        className="textLayer"
        style={{ pointerEvents: activeTool === 'select' ? 'auto' : 'none' }}
      />

      {isDragging && (
        <div 
          className="absolute border-2 z-[40] pointer-events-none"
          style={{
            borderColor: accentColor,
            backgroundColor: `${accentColor}33`,
            left: currentRect.x,
            top: currentRect.y,
            width: currentRect.w,
            height: currentRect.h,
          }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none z-20">
        {annotations.filter(a => a.pageIndex === pageIndex).map(ann => (
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

const AnnotationItem: React.FC<{ ann: Annotation; isSelected: boolean; accentColor: string; onDelete: () => void; onSelect: () => void }> = ({ ann, isSelected, accentColor, onDelete, onSelect }) => {
  const isText = ann.type === 'text' || ann.type === 'comment';
  return (
    <div 
      className={`absolute pointer-events-auto transition-all ${isSelected ? 'shadow-xl z-30' : 'z-10'}`}
      style={{
        left: `${ann.rect.x * 100}%`,
        top: `${ann.rect.y * 100}%`,
        width: `${ann.rect.width * 100}%`,
        height: `${ann.rect.height * 100}%`,
        backgroundColor: ann.type === 'highlight' ? `${ann.color}77` : 'transparent',
        borderBottom: ann.type === 'strikeout' ? `2px solid ${ann.color}` : 'none',
        outline: isSelected ? `2px solid ${accentColor}` : undefined,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isText && isSelected && (
        <div className="absolute top-full mt-2 w-64 bg-white shadow-2xl rounded-xl p-4 border border-gray-100 z-50">
          <textarea 
            className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-800 text-xs font-medium" 
            placeholder="Escreva sua nota..." 
            rows={3}
            defaultValue={ann.content || ''}
            autoFocus
          />
        </div>
      )}
      {isSelected && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
};

export default PageRenderer;
