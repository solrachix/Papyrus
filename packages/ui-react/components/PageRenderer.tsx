
import React, { useEffect, useRef, useState } from 'react';
import { useViewerStore, papyrusEvents } from '../../core/index';
import { DocumentEngine, Annotation, PapyrusEventType } from '../../types/index';

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
    annotations, addAnnotation, activeTool, sidebarRightOpen, sidebarRightTab,
    removeAnnotation, selectedAnnotationId, setSelectedAnnotation
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

        // 1. Renderizar Visual (Canvas)
        await engine.renderPage(pageIndex, canvasRef.current, RENDER_SCALE);

        // 2. Renderizar Camada de Interação (Texto)
        textLayerRef.current.innerHTML = '';
        await engine.renderTextLayer(pageIndex, textLayerRef.current, RENDER_SCALE);

      } catch (err) {
        console.error("Papyrus Render Error:", err);
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
          const annotation: Annotation = {
            id: Math.random().toString(36).substr(2, 9),
            pageIndex,
            type: activeTool as any,
            rect: {
              x: currentRect.x / rect.width,
              y: currentRect.y / rect.height,
              width: currentRect.w / rect.width,
              height: currentRect.h / rect.height,
            },
            color: activeTool === 'highlight' ? '#fbbf24' : activeTool === 'strikeout' ? '#ef4444' : '#3b82f6',
            content: activeTool === 'text' || activeTool === 'comment' ? '' : undefined,
            createdAt: Date.now()
          };
          addAnnotation(annotation);
        }
      }
      setCurrentRect({ x: 0, y: 0, w: 0, h: 0 });
      return;
    }

    if (activeTool === 'select') {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim();
      if (selectedText && selectedText.length > 0) {
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

  const pageAnnotations = annotations.filter(a => a.pageIndex === pageIndex);

  return (
    <div 
      ref={containerRef}
      className={`relative inline-block shadow-2xl bg-white mb-10 transition-transform duration-300 ${activeTool !== 'select' ? 'no-select cursor-crosshair' : ''}`}
      style={{ scrollMarginTop: '20px', minHeight: '100px' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {loading && (
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center z-10 animate-pulse">
           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sincronizando...</span>
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
          className="absolute border-2 border-blue-500 bg-blue-500/20 z-[40] pointer-events-none"
          style={{
            left: currentRect.x,
            top: currentRect.y,
            width: currentRect.w,
            height: currentRect.h
          }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none z-20">
        {pageAnnotations.map(ann => (
          <AnnotationItem 
            key={ann.id} 
            ann={ann} 
            isSelected={selectedAnnotationId === ann.id}
            onDelete={() => removeAnnotation(ann.id)}
            onSelect={() => setSelectedAnnotation(ann.id)}
          />
        ))}
      </div>
    </div>
  );
};

const AnnotationItem: React.FC<{ ann: Annotation; isSelected: boolean; onDelete: () => void; onSelect: () => void }> = ({ ann, isSelected, onDelete, onSelect }) => {
  const isText = ann.type === 'text' || ann.type === 'comment';
  return (
    <div 
      className={`absolute pointer-events-auto transition-all ${isSelected ? 'ring-2 ring-blue-500 shadow-xl z-30' : 'z-10 hover:ring-1 hover:ring-blue-300'}`}
      style={{
        left: `${ann.rect.x * 100}%`,
        top: `${ann.rect.y * 100}%`,
        width: `${ann.rect.width * 100}%`,
        height: `${ann.rect.height * 100}%`,
        backgroundColor: ann.type === 'highlight' ? `${ann.color}77` : 'transparent',
        borderBottom: ann.type === 'strikeout' ? `2px solid ${ann.color}` : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {isText && isSelected && (
        <div className="absolute top-full mt-2 w-64 bg-white shadow-2xl rounded-xl p-4 border border-gray-100 z-50">
          <textarea 
            className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-800 text-xs font-medium" 
            placeholder="Nota..." 
            rows={3}
            defaultValue={ann.content || ''}
            autoFocus
          />
        </div>
      )}
      {isSelected && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-all"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
};

export default PageRenderer;
