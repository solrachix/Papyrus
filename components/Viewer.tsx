
import React, { useEffect, useRef } from 'react';
import { useViewerStore } from '../core/store';
import { DocumentEngine } from '../types';
import PageRenderer from './PageRenderer';

interface ViewerProps {
  engine: DocumentEngine;
}

const Viewer: React.FC<ViewerProps> = ({ engine }) => {
  const { viewMode, pageCount, currentPage, activeTool, uiTheme, setDocumentState } = useViewerStore();
  const isDark = uiTheme === 'dark';
  const viewerRef = useRef<HTMLDivElement>(null);

  // Synchronize current page based on scroll position
  useEffect(() => {
    const observerOptions = {
      root: viewerRef.current,
      rootMargin: '0px',
      threshold: 0.5, // 50% visibility triggers page change
    };

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageIndex = parseInt(entry.target.getAttribute('data-page-index') || '0');
          // Only update if it's different to prevent loops
          if (pageIndex + 1 !== currentPage) {
            setDocumentState({ currentPage: pageIndex + 1 });
          }
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersect, observerOptions);
    const pageElements = viewerRef.current?.querySelectorAll('.page-container');
    pageElements?.forEach((el) => observer.observe(el));

    return () => {
      pageElements?.forEach((el) => observer.unobserve(el));
      observer.disconnect();
    };
  }, [pageCount, viewMode, setDocumentState, currentPage]);

  const getPagesToRender = () => {
    if (viewMode === 'continuous') {
      return Array.from({ length: pageCount }).map((_, i) => i);
    }
    if (viewMode === 'single') {
      return [currentPage - 1];
    }
    return [currentPage - 1];
  };

  const pages = getPagesToRender();

  const tools = [
    { id: 'select', name: 'Select', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5' },
    { id: 'highlight', name: 'Marker', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
    { id: 'strikeout', name: 'Strike', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'text', name: 'Text', icon: 'M4 6h16M4 12h16m-7 6h7' },
    { id: 'comment', name: 'Note', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  ];

  return (
    <div 
      ref={viewerRef}
      className={`flex-1 overflow-auto flex flex-col items-center py-16 relative transition-colors duration-500 custom-scrollbar scroll-smooth ${isDark ? 'bg-[#121212]' : 'bg-[#e9ecef]'}`}
    >
      <div className="flex flex-col items-center gap-6 px-10 w-full max-w-full">
        {pages.map(idx => (
          <div key={idx} data-page-index={idx} className="page-container">
            <PageRenderer engine={engine} pageIndex={idx} />
          </div>
        ))}
      </div>

      {/* Stylized Floating Tool Bar */}
      <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 shadow-[0_12px_30px_rgba(0,0,0,0.15)] rounded-[20px] p-2 flex items-center gap-1 border z-50 transition-all ${isDark ? 'bg-[#2a2a2a]/90 border-[#3a3a3a] backdrop-blur-xl' : 'bg-white/95 border-gray-100/50 backdrop-blur-md'}`}>
        {tools.map(tool => (
          <button 
            key={tool.id}
            onClick={() => setDocumentState({ activeTool: tool.id as any })}
            className={`flex items-center justify-center w-11 h-11 rounded-[14px] transition-all group relative ${activeTool === tool.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40' : isDark ? 'text-gray-400 hover:bg-white/5 hover:text-white' : 'hover:bg-gray-50 text-gray-500 hover:text-gray-900'}`}
          >
            <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d={tool.icon} />
            </svg>
            <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap uppercase tracking-wider">
              {tool.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Viewer;
