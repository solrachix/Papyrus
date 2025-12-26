
import React, { useRef, useState, useEffect } from 'react';
import { useViewerStore } from '../core/store';
import { DocumentEngine, UITheme, PageTheme } from '../types';

interface TopbarProps {
  engine: DocumentEngine;
}

const Topbar: React.FC<TopbarProps> = ({ engine }) => {
  const { 
    currentPage, 
    pageCount, 
    zoom, 
    viewMode, 
    uiTheme,
    pageTheme,
    setDocumentState,
    toggleSidebarLeft,
    toggleSidebarRight,
    triggerScrollToPage
  } = useViewerStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const [showPageThemes, setShowPageThemes] = useState(false);

  const isDark = uiTheme === 'dark';

  useEffect(() => {
    setPageInput(currentPage.toString());
  }, [currentPage]);

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.2, Math.min(5, zoom + delta));
    engine.setZoom(newZoom);
    setDocumentState({ zoom: newZoom });
  };

  const handlePageChange = (page: number) => {
    if (pageCount <= 0) return;
    const p = Math.max(1, Math.min(pageCount, page));
    engine.goToPage(p);
    setDocumentState({ currentPage: p });
    triggerScrollToPage(p - 1);
  };

  const handlePageInputBlur = () => {
    const val = parseInt(pageInput);
    if (!isNaN(val)) handlePageChange(val);
    else setPageInput(currentPage.toString());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocumentState({ isLoaded: false });
      try {
        await engine.load(file);
        setDocumentState({
          isLoaded: true,
          pageCount: engine.getPageCount(),
          currentPage: 1,
          zoom: 1.0,
          annotations: [],
          searchResults: [],
          searchQuery: ''
        });
      } catch (err) {
        console.error("Upload failed", err);
      }
    }
  };

  const themes: { id: PageTheme; name: string; color: string }[] = [
    { id: 'normal', name: 'Original', color: 'bg-white' },
    { id: 'sepia', name: 'Sepia', color: 'bg-[#f4ecd8]' },
    { id: 'dark', name: 'Inverted', color: 'bg-gray-800' },
    { id: 'high-contrast', name: 'Contrast', color: 'bg-black' },
  ];

  return (
    <div className={`h-14 border-b flex items-center justify-between px-4 z-50 transition-colors duration-200 ${isDark ? 'bg-[#1a1a1a] border-[#333] text-white' : 'bg-white border-gray-200 text-gray-800'}`}>
      <div className="flex items-center space-x-3">
        <button 
          onClick={toggleSidebarLeft}
          className={`p-2 rounded-md transition-all ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="font-bold text-lg tracking-tight text-blue-500">Cringe<span className={isDark ? 'text-white' : 'text-gray-900'}>PDF</span></span>
      </div>

      <div className="flex items-center space-x-4">
        <div className={`flex items-center rounded-lg p-1 space-x-1 border ${isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-gray-50 border-gray-200'}`}>
          <button onClick={() => handlePageChange(currentPage - 1)} className="p-1.5 hover:bg-blue-500 hover:text-white rounded transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex items-center px-2">
            <input 
              type="text" 
              className="w-10 text-center bg-transparent focus:outline-none font-bold text-sm" 
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={handlePageInputBlur}
              onKeyDown={(e) => e.key === 'Enter' && handlePageInputBlur()}
            />
            <span className="opacity-40 px-1">/</span>
            <span className="opacity-80 text-sm">{pageCount > 0 ? pageCount : '—'}</span>
          </div>
          <button onClick={() => handlePageChange(currentPage + 1)} className="p-1.5 hover:bg-blue-500 hover:text-white rounded transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className={`flex items-center rounded-lg p-1 border ${isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-gray-50 border-gray-200'}`}>
          <button onClick={() => handleZoom(-0.1)} className="p-1.5 hover:bg-blue-500 hover:text-white rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
          <span className="px-3 text-xs font-bold min-w-[55px] text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => handleZoom(0.1)} className="p-1.5 hover:bg-blue-500 hover:text-white rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {/* Page Theme Dropdown */}
        <div className="relative">
          <button 
            onClick={() => setShowPageThemes(!showPageThemes)}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-bold border transition-all ${isDark ? 'bg-[#2a2a2a] border-[#444] hover:bg-[#333]' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
          >
            <div className={`w-3 h-3 rounded-full border border-gray-400 ${themes.find(t => t.id === pageTheme)?.color}`} />
            <span>THEME</span>
          </button>
          {showPageThemes && (
            <div className={`absolute top-full right-0 mt-2 w-48 rounded-lg shadow-2xl border p-2 z-[60] ${isDark ? 'bg-[#2a2a2a] border-[#444]' : 'bg-white border-gray-200'}`}>
              <p className="text-[10px] font-bold text-gray-500 mb-2 px-2 uppercase">Page Rendering</p>
              {themes.map(t => (
                <button 
                  key={t.id}
                  onClick={() => {
                    setDocumentState({ pageTheme: t.id });
                    setShowPageThemes(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-all ${pageTheme === t.id ? 'bg-blue-500 text-white' : isDark ? 'hover:bg-white/10 text-gray-300' : 'hover:bg-gray-50 text-gray-700'}`}
                >
                  <div className={`w-4 h-4 rounded-full border border-gray-400 ${t.color}`} />
                  <span className="font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* UI Theme Toggle */}
        <button 
          onClick={() => setDocumentState({ uiTheme: isDark ? 'light' : 'dark' })}
          className={`p-2 rounded-full transition-all ${isDark ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          {isDark ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" /></svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" /></svg>
          )}
        </button>

        <button 
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold shadow-md shadow-blue-500/30 transition-all active:scale-95"
        >
          UPLOAD
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.epub,.txt" onChange={handleFileUpload} />
        
        <div className={`h-8 w-px ${isDark ? 'bg-[#333]' : 'bg-gray-200'}`} />
        
        <button onClick={() => toggleSidebarRight('search')} className={`p-2 rounded-md ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </button>
      </div>
    </div>
  );
};

export default Topbar;
