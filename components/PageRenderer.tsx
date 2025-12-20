
import React, { useEffect, useRef, useState } from 'react';
import { DocumentEngine, Annotation, TextItem } from '../types';
import { useViewerStore } from '../core/store';

interface PageRendererProps {
  engine: DocumentEngine;
  pageIndex: number;
}

const PageRenderer: React.FC<PageRendererProps> = ({ engine, pageIndex }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [textContent, setTextContent] = useState<TextItem[]>([]);
  
  const { 
    zoom, 
    rotation, 
    annotations, 
    activeTool, 
    pageTheme,
    scrollToPageSignal,
    searchQuery,
    sidebarRightTab,
    sidebarRightOpen,
    setDocumentState,
    addAnnotation, 
    updateAnnotation, 
    removeAnnotation,
    selectedAnnotationId,
    setSelectedAnnotation
  } = useViewerStore();

  const isSearchActive = sidebarRightOpen && sidebarRightTab === 'search' && searchQuery.length > 1;

  useEffect(() => {
    if (scrollToPageSignal === pageIndex && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setDocumentState({ scrollToPageSignal: null });
    }
  }, [scrollToPageSignal, pageIndex, setDocumentState]);

  useEffect(() => {
    let active = true;
    const render = async () => {
      if (!canvasRef.current) return;
      setLoading(true);
      try {
        await engine.renderPage(pageIndex, canvasRef.current, 2.0); 
        const text = await engine.getTextContent(pageIndex);
        if (active) setTextContent(text);
      } finally {
        if (active) setLoading(false);
      }
    };
    render();
    return () => { active = false; };
  }, [engine, pageIndex, zoom, rotation]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (activeTool === 'select') {
      setSelectedAnnotation(null);
      return;
    }
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const newAnnotation: Annotation = {
      id: Math.random().toString(36).substr(2, 9),
      pageIndex,
      type: activeTool as any,
      rect: { x, y, width: 0.15, height: 0.04 },
      color: activeTool === 'highlight' ? '#fbbf24' : activeTool === 'strikeout' ? '#ef4444' : '#3b82f6',
      content: activeTool === 'text' || activeTool === 'comment' ? '' : undefined,
      createdAt: Date.now()
    };

    addAnnotation(newAnnotation);
  };

  const getPageFilter = () => {
    switch(pageTheme) {
      case 'sepia': return 'sepia(0.5) contrast(1.1) brightness(0.95)';
      case 'dark': return 'invert(0.9) hue-rotate(180deg) brightness(1.2) contrast(0.9)';
      case 'high-contrast': return 'grayscale(1) contrast(2) brightness(0.8)';
      default: return 'none';
    }
  };

  const pageAnnotations = annotations.filter(a => a.pageIndex === pageIndex);

  const searchHighlights = isSearchActive 
    ? textContent.filter(item => item.str.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  return (
    <div 
      ref={containerRef}
      className="relative inline-block shadow-2xl mb-12 bg-white transition-all duration-500 transform hover:shadow-blue-500/10"
      style={{ scrollMarginTop: '20px' }}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/90 z-10 transition-opacity">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-12 w-12 bg-blue-100 rounded-full mb-3 flex items-center justify-center">
               <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        </div>
      )}
      <canvas 
        ref={canvasRef} 
        style={{ filter: getPageFilter() }}
        className={`block transition-all duration-300 ${activeTool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
        onClick={handleCanvasClick}
      />
      
      {/* Search Highlighting Layer - Disappears if tab changes or search is closed */}
      {isSearchActive && (
        <div className="absolute inset-0 pointer-events-none opacity-50 z-10">
          {searchHighlights.map((item, i) => (
              <div 
                key={`search-${i}`}
                className="absolute bg-yellow-300/60 ring-1 ring-yellow-400 mix-blend-multiply"
                style={{
                   left: `${(item.transform[4] / (canvasRef.current?.width || 600) * 100 * (canvasRef.current?.width || 1) / 3.5)}%`, 
                   bottom: `${(item.transform[5] / (canvasRef.current?.height || 800) * 100 * (canvasRef.current?.height || 1) / 4.5)}%`,
                   width: `${(item.width / (canvasRef.current?.width || 600) * 100 * 150)}%`,
                   height: `${(item.height / (canvasRef.current?.height || 800) * 100 * 120)}%`,
                   minHeight: '1.2%',
                   minWidth: '2%'
                }}
              />
          ))}
        </div>
      )}

      {/* Annotation Overlay Layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-20">
        {pageAnnotations.map(ann => (
          <AnnotationItem 
            key={ann.id} 
            ann={ann} 
            isSelected={selectedAnnotationId === ann.id}
            onUpdate={(val) => updateAnnotation(ann.id, val)}
            onDelete={() => removeAnnotation(ann.id)}
            onSelect={() => setSelectedAnnotation(ann.id)}
          />
        ))}
      </div>
    </div>
  );
};

interface AnnotationItemProps {
  ann: Annotation;
  isSelected: boolean;
  onUpdate: (updates: Partial<Annotation>) => void;
  onDelete: () => void;
  onSelect: () => void;
}

const AnnotationItem: React.FC<AnnotationItemProps> = ({ ann, isSelected, onUpdate, onDelete, onSelect }) => {
  const isText = ann.type === 'text' || ann.type === 'comment';
  
  return (
    <div 
      className={`absolute pointer-events-auto transition-all duration-200 ${isSelected ? 'ring-2 ring-blue-500 shadow-2xl z-30 scale-105' : 'hover:ring-1 hover:ring-blue-300 z-10'}`}
      style={{
        left: `${ann.rect.x * 100}%`,
        top: `${ann.rect.y * 100}%`,
        width: isText ? 'auto' : '150px',
        minWidth: isText ? '150px' : '0px',
        height: ann.type === 'highlight' ? '1.5em' : 'auto',
        minHeight: '20px',
        backgroundColor: ann.type === 'highlight' ? `${ann.color}66` : 'transparent',
        borderBottom: ann.type === 'strikeout' ? `3px solid ${ann.color}` : 'none',
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      {isText ? (
        <div className="bg-white/95 backdrop-blur-xl p-3 rounded-lg shadow-xl border border-gray-100">
          <textarea
            autoFocus={isSelected && ann.content === ''}
            className="w-full bg-transparent border-none focus:ring-0 text-sm font-semibold text-gray-900 p-0 overflow-hidden tracking-tight"
            placeholder="Write a thought..."
            value={ann.content || ''}
            onChange={(e) => onUpdate({ content: e.target.value })}
            rows={3}
          />
        </div>
      ) : (
        <div className="w-full h-full" />
      )}

      {isSelected && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-all z-40 scale-110 active:scale-95"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
};

export default PageRenderer;
