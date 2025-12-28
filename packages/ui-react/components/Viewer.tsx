
import React, { useEffect, useRef, useState } from 'react';
import { useViewerStore } from '@papyrus-sdk/core';
import { DocumentEngine } from '@papyrus-sdk/types';
import PageRenderer from './PageRenderer';

interface ViewerProps { engine: DocumentEngine; }

const Viewer: React.FC<ViewerProps> = ({ engine }) => {
  const { viewMode, pageCount, currentPage, activeTool, uiTheme, setDocumentState, accentColor } = useViewerStore();
  const isDark = uiTheme === 'dark';
  const viewerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState<number | null>(null);
  const isCompact = availableWidth !== null && availableWidth < 820;
  const paddingY = isCompact ? 'py-10' : 'py-16';
  const toolDockPosition = isCompact ? 'bottom-6' : 'bottom-10';

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const updateWidth = () => {
      const nextWidth = element.clientWidth;
      if (nextWidth > 0) setAvailableWidth(nextWidth);
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const pageIndex = parseInt(entry.target.getAttribute('data-page-index') || '0');
          if (pageIndex + 1 !== currentPage) setDocumentState({ currentPage: pageIndex + 1 });
        }
      });
    }, { root: viewerRef.current, threshold: 0.5 });

    const pageElements = viewerRef.current?.querySelectorAll('.page-container');
    pageElements?.forEach((el) => observer.observe(el));
    return () => { pageElements?.forEach((el) => observer.unobserve(el)); observer.disconnect(); };
  }, [pageCount, setDocumentState, currentPage]);

  const pages = Array.from({ length: pageCount }).map((_, i) => i);
  const tools = [
    { id: 'select', name: 'Select', icon: 'M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5' },
    { id: 'highlight', name: 'Marker', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
    { id: 'strikeout', name: 'Strike', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
    { id: 'comment', name: 'Note', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  ];

  return (
    <div ref={viewerRef} className={`flex-1 overflow-auto flex flex-col items-center ${paddingY} relative custom-scrollbar scroll-smooth ${isDark ? 'bg-[#121212]' : 'bg-[#e9ecef]'}`}>
      <div className="flex flex-col items-center gap-6 w-full">
        {pages.map(idx => (
          <div key={idx} data-page-index={idx} className="page-container">
            <PageRenderer engine={engine} pageIndex={idx} availableWidth={availableWidth ?? undefined} />
          </div>
        ))}
      </div>
      <div className={`fixed ${toolDockPosition} left-1/2 -translate-x-1/2 shadow-2xl rounded-2xl p-2 flex border z-50 ${isDark ? 'bg-[#2a2a2a]/90 border-[#3a3a3a] backdrop-blur-xl' : 'bg-white/95 border-gray-100 backdrop-blur-md'}`}>
        {tools.map(tool => (
          <button
            key={tool.id}
            onClick={() => setDocumentState({ activeTool: tool.id as any })}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${activeTool === tool.id ? 'text-white shadow-lg' : 'text-gray-400'}`}
            style={activeTool === tool.id ? { backgroundColor: accentColor } : undefined}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tool.icon} /></svg>
          </button>
        ))}
      </div>
    </div>
  );
};
export default Viewer;
