
import React, { useEffect, useRef, useState } from 'react';
import { useViewerStore } from '@papyrus/core';
import { DocumentEngine, OutlineItem } from '@papyrus/types';

interface SidebarLeftProps {
  engine: DocumentEngine;
}

const withAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '').trim();
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const Thumbnail: React.FC<{ engine: DocumentEngine; pageIndex: number; active: boolean; isDark: boolean; accentColor: string; onClick: () => void }> = ({ engine, pageIndex, active, isDark, accentColor, onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accentSoft = withAlpha(accentColor, 0.12);

  useEffect(() => {
    if (canvasRef.current) {
      engine.renderPage(pageIndex, canvasRef.current, 0.15);
    }
  }, [engine, pageIndex]);

  return (
    <div 
      onClick={onClick}
      className={`p-3 cursor-pointer transition-all rounded-lg border-2 ${active ? 'shadow-sm' : 'border-transparent'}`}
      style={active ? { borderColor: accentColor, backgroundColor: accentSoft } : undefined}
    >
      <div className="flex flex-col items-center">
        <div className={`shadow-lg rounded overflow-hidden mb-2 border ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
          <canvas ref={canvasRef} className="max-w-full h-auto bg-white" />
        </div>
        <span className={`text-[11px] font-bold ${active ? '' : isDark ? 'text-gray-500' : 'text-gray-400'}`} style={active ? { color: accentColor } : undefined}>{pageIndex + 1}</span>
      </div>
    </div>
  );
};

const OutlineNode: React.FC<{ item: OutlineItem; engine: DocumentEngine; isDark: boolean; accentColor: string; depth?: number }> = ({ item, engine, isDark, accentColor, depth = 0 }) => {
  const { triggerScrollToPage, outlineSearchQuery } = useViewerStore();
  const [expanded, setExpanded] = useState(true);
  const accentSoft = withAlpha(accentColor, 0.2);

  const matchesSearch = outlineSearchQuery === '' || item.title.toLowerCase().includes(outlineSearchQuery.toLowerCase());
  const hasMatchingChildren = item.children?.some(child => child.title.toLowerCase().includes(outlineSearchQuery.toLowerCase()));

  if (!matchesSearch && !hasMatchingChildren && outlineSearchQuery !== '') return null;

  const handleClick = () => {
    if (item.pageIndex >= 0) {
      engine.goToPage(item.pageIndex + 1);
      triggerScrollToPage(item.pageIndex);
    }
  };

  return (
    <div className="flex flex-col">
      <div 
        className={`flex items-center py-1.5 px-3 rounded-md transition-colors group ${item.pageIndex >= 0 ? 'cursor-pointer' : 'cursor-default'} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
      >
        {item.children && item.children.length > 0 ? (
          <button 
            className={`mr-1 text-gray-400 transition-transform p-1`}
            style={{ color: accentColor, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : <div className="w-5" />}
        <span
          className={`text-[13px] leading-tight font-medium truncate ${isDark ? 'text-gray-200' : 'text-gray-700'}`}
          style={matchesSearch && outlineSearchQuery ? { backgroundColor: accentSoft, color: accentColor } : undefined}
        >
          {item.title}
        </span>
      </div>
      {expanded && item.children && item.children.length > 0 && (
        <div className="flex flex-col">
          {item.children.map((child, i) => (
            <OutlineNode key={i} item={child} engine={engine} isDark={isDark} accentColor={accentColor} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const SidebarLeft: React.FC<SidebarLeftProps> = ({ engine }) => {
  const { 
    pageCount, currentPage, setDocumentState, sidebarLeftOpen, uiTheme, 
    triggerScrollToPage, sidebarLeftTab, setSidebarLeftTab, outline,
    outlineSearchQuery, setOutlineSearch, accentColor
  } = useViewerStore();
  const isDark = uiTheme === 'dark';

  if (!sidebarLeftOpen) return null;

  return (
    <div className={`w-72 border-r flex flex-col h-full shrink-0 overflow-hidden transition-colors duration-200 ${isDark ? 'bg-[#2a2a2a] border-[#3a3a3a]' : 'bg-[#fcfcfc] border-gray-200'}`}>
      <div className={`p-4 border-b flex flex-col space-y-4 ${isDark ? 'border-[#3a3a3a]' : 'border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-bold uppercase tracking-widest ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
            {sidebarLeftTab === 'thumbnails' ? 'Thumbnails' : 'Sumário'}
          </h3>
          <button onClick={() => setDocumentState({ sidebarLeftOpen: false })} className="text-gray-400 hover:text-gray-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setSidebarLeftTab('thumbnails')}
            className={`p-2 rounded-md ${sidebarLeftTab === 'thumbnails' ? (isDark ? 'bg-white/10 text-white' : 'bg-white shadow-sm border border-gray-200') : 'text-gray-400'}`}
            style={sidebarLeftTab === 'thumbnails' && !isDark ? { color: accentColor } : undefined}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2 2V6z" /></svg>
          </button>
          <button
            onClick={() => setSidebarLeftTab('summary')}
            className={`p-2 rounded-md ${sidebarLeftTab === 'summary' ? (isDark ? 'bg-white/10 text-white' : 'bg-white shadow-sm border border-gray-200') : 'text-gray-400'}`}
            style={sidebarLeftTab === 'summary' && !isDark ? { color: accentColor } : undefined}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
        {sidebarLeftTab === 'thumbnails' ? (
          <div className="space-y-1">
            {Array.from({ length: pageCount }).map((_, idx) => (
              <Thumbnail key={idx} engine={engine} pageIndex={idx} isDark={isDark} accentColor={accentColor} active={currentPage === idx + 1} onClick={() => { engine.goToPage(idx + 1); setDocumentState({ currentPage: idx + 1 }); triggerScrollToPage(idx); }} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col space-y-0.5">
            {outline.map((item, i) => (<OutlineNode key={i} item={item} engine={engine} isDark={isDark} accentColor={accentColor} />))}
          </div>
        )}
      </div>
    </div>
  );
};
export default SidebarLeft;
