
import React, { useRef, useState, useEffect } from 'react';
import { useViewerStore } from '@papyrus/core';
import { DocumentEngine, PageTheme } from '@papyrus/types';

interface TopbarProps { engine: DocumentEngine; }

const Topbar: React.FC<TopbarProps> = ({ engine }) => {
  const { 
    currentPage, pageCount, zoom, uiTheme, pageTheme, setDocumentState, accentColor,
    toggleSidebarLeft, toggleSidebarRight, triggerScrollToPage
  } = useViewerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const [showPageThemes, setShowPageThemes] = useState(false);
  const isDark = uiTheme === 'dark';

  useEffect(() => { setPageInput(currentPage.toString()); }, [currentPage]);

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.2, Math.min(5, zoom + delta));
    engine.setZoom(newZoom);
    setDocumentState({ zoom: newZoom });
  };

  const handlePageChange = (page: number) => {
    const p = Math.max(1, Math.min(pageCount, isNaN(page) ? 1 : page));
    engine.goToPage(p);
    setDocumentState({ currentPage: p });
    triggerScrollToPage(p - 1);
  };

  const themes: { id: PageTheme; name: string; color: string }[] = [
    { id: 'normal', name: 'Original', color: 'bg-white' },
    { id: 'sepia', name: 'Sépia', color: 'bg-[#f4ecd8]' },
    { id: 'dark', name: 'Invertido', color: 'bg-gray-800' },
    { id: 'high-contrast', name: 'Contraste', color: 'bg-black' },
  ];

  return (
    <div className={`h-14 border-b flex items-center justify-between px-4 z-50 transition-colors duration-200 ${isDark ? 'bg-[#1a1a1a] border-[#333] text-white' : 'bg-white border-gray-200 text-gray-800'}`}>
      <div className="flex items-center space-x-3">
        <button onClick={toggleSidebarLeft} className={`p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="font-bold text-lg tracking-tight" style={{ color: accentColor }}>
          Papyrus<span className={isDark ? 'text-white' : 'text-gray-900'}>Core</span>
        </span>
      </div>

      <div className="flex items-center space-x-4">
        <div className={`flex items-center rounded-lg p-1 space-x-1 border ${isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-gray-50 border-gray-200'}`}>
          <button onClick={() => handlePageChange(currentPage - 1)} className="p-1.5 rounded transition-all hover:brightness-110" style={{ color: accentColor }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <input 
            type="text" 
            className="w-10 text-center bg-transparent focus:outline-none font-bold text-sm" 
            value={pageInput} 
            onChange={(e) => setPageInput(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handlePageChange(parseInt(pageInput))}
            onBlur={() => handlePageChange(parseInt(pageInput))} 
          />
          <span className="opacity-40 px-1">/</span><span className="opacity-80 text-sm">{pageCount}</span>
          <button onClick={() => handlePageChange(currentPage + 1)} className="p-1.5 rounded transition-all hover:brightness-110" style={{ color: accentColor }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className={`flex items-center rounded-lg p-1 border ${isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-gray-50 border-gray-200'}`}>
          <button onClick={() => handleZoom(-0.1)} className="p-1.5 rounded hover:brightness-110" style={{ color: accentColor }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
          <span className="px-3 text-xs font-bold min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => handleZoom(0.1)} className="p-1.5 rounded hover:brightness-110" style={{ color: accentColor }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {/* Page Theme Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowPageThemes(!showPageThemes)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-gray-50 border-gray-200'}`}
          >
            <div className={`w-3 h-3 rounded-full border ${themes.find(t => t.id === pageTheme)?.color}`} />
            <span>TEMA</span>
          </button>
          {showPageThemes && (
            <div className={`absolute top-full right-0 mt-2 w-48 rounded-lg shadow-xl border p-2 z-[60] ${isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-white border-gray-200'}`}>
              {themes.map(t => (
                <button 
                  key={t.id}
                  onClick={() => { setDocumentState({ pageTheme: t.id }); setShowPageThemes(false); }}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm ${pageTheme === t.id ? 'text-white' : isDark ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-gray-50 text-gray-700'}`}
                  style={pageTheme === t.id ? { backgroundColor: accentColor } : undefined}
                >
                  <div className={`w-3 h-3 rounded-full border ${t.color}`} />
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setDocumentState({ uiTheme: isDark ? 'light' : 'dark' })} className={`p-2 rounded-full ${isDark ? 'bg-yellow-500/10 text-yellow-500' : 'bg-gray-100 text-gray-500'}`}>
          {isDark ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414z" /></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-1.5 text-white rounded-md text-sm font-bold shadow-md active:scale-95"
          style={{ backgroundColor: accentColor }}
        >
          UPLOAD
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            setDocumentState({ isLoaded: false });
            await engine.load(file);
            setDocumentState({ isLoaded: true, pageCount: engine.getPageCount(), currentPage: 1, outline: await engine.getOutline() });
          }
        }} />
        <button onClick={() => toggleSidebarRight('search')} className={`p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></button>
      </div>
    </div>
  );
};
export default Topbar;
