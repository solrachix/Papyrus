
import React, { useState } from 'react';
import { useViewerStore, SearchService } from '@papyrus-sdk/core';
import { DocumentEngine } from '@papyrus-sdk/types';

interface SidebarRightProps { engine: DocumentEngine; }

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

const SidebarRight: React.FC<SidebarRightProps> = ({ engine }) => {
  const { 
    sidebarRightOpen, sidebarRightTab, toggleSidebarRight, searchResults, activeSearchIndex,
    uiTheme, setSearch, setDocumentState, triggerScrollToPage, annotations, accentColor
  } = useViewerStore();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const searchService = new SearchService(engine);
  const isDark = uiTheme === 'dark';
  const accentSoft = withAlpha(accentColor, 0.12);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) { setSearch('', []); return; }
    setIsSearching(true);
    const results = await searchService.search(query);
    setSearch(query, results);
    setIsSearching(false);
  };

  if (!sidebarRightOpen) return null;

  return (
    <div className={`w-80 border-l flex flex-col h-full shrink-0 transition-colors duration-200 shadow-2xl z-40 ${isDark ? 'bg-[#1a1a1a] border-[#333]' : 'bg-white border-gray-200'}`}>
      <div className={`p-4 border-b flex items-center justify-between shrink-0 ${isDark ? 'border-[#333]' : 'border-gray-100'}`}>
        <div className="flex space-x-6">
          <button
            onClick={() => toggleSidebarRight('search')}
            className={`text-[10px] font-black uppercase tracking-widest pb-1 transition-all ${sidebarRightTab === 'search' ? 'border-b-2' : 'text-gray-400'}`}
            style={sidebarRightTab === 'search' ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            Busca
          </button>
          <button
            onClick={() => toggleSidebarRight('annotations')}
            className={`text-[10px] font-black uppercase tracking-widest pb-1 transition-all ${sidebarRightTab === 'annotations' ? 'border-b-2' : 'text-gray-400'}`}
            style={sidebarRightTab === 'annotations' ? { color: accentColor, borderColor: accentColor } : undefined}
          >
            Notas
          </button>
        </div>
        <button onClick={() => toggleSidebarRight()} className="text-gray-400 hover:text-red-500 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-opacity-50">
        {sidebarRightTab === 'search' ? (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="relative mb-6">
              <input 
                type="text" 
                className={`w-full rounded-lg px-4 py-2.5 text-xs outline-none border transition-all shadow-inner font-medium ${isDark ? 'bg-[#2a2a2a] text-white border-[#444] focus:border-blue-500' : 'bg-gray-100 border-gray-200 focus:bg-white focus:border-blue-400'}`} 
                placeholder="O que você procura?" 
                value={query} 
                onChange={(e) => setQuery(e.target.value)} 
              />
              <button type="submit" className="absolute right-3 top-2.5 text-gray-400 transition-colors" style={{ color: accentColor }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
            </form>

            {isSearching && (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: accentColor }} />
                <span className="text-[10px] font-bold text-gray-500 uppercase">Varrendo documento...</span>
              </div>
            )}

            {!isSearching && searchResults.map((res, idx) => (
              <div 
                key={idx} 
                onClick={() => { setDocumentState({ activeSearchIndex: idx }); triggerScrollToPage(res.pageIndex); }} 
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all group hover:scale-[1.02] ${idx === activeSearchIndex ? 'shadow-lg' : isDark ? 'border-[#333] hover:border-[#555] bg-[#222]' : 'border-gray-50 hover:border-gray-200 bg-gray-50/50 hover:bg-white'}`}
                style={idx === activeSearchIndex ? { borderColor: accentColor, backgroundColor: accentSoft } : undefined}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-[10px] font-black uppercase tracking-tighter ${idx === activeSearchIndex ? '' : 'text-gray-400'}`}
                    style={idx === activeSearchIndex ? { color: accentColor } : undefined}
                  >
                    PÁGINA {res.pageIndex + 1}
                  </span>
                  <svg
                    className={`w-3 h-3 transition-transform ${idx === activeSearchIndex ? '' : 'text-gray-300'}`}
                    style={idx === activeSearchIndex ? { color: accentColor } : undefined}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <p className={`text-[11px] font-medium leading-relaxed italic ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>...{res.text}...</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center">
              <span>WORKSET</span>
              <div className="flex-1 h-px bg-current ml-3 opacity-10" />
            </div>
            {annotations.length === 0 ? (
              <div className="text-center py-20">
                 <div className="w-12 h-12 bg-gray-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                   <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                 </div>
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sem anotações</p>
              </div>
            ) : (
              annotations.map(ann => (
                <div key={ann.id} className={`p-4 rounded-xl border group transition-all cursor-pointer ${isDark ? 'bg-[#222] border-[#333] hover:border-[#444]' : 'bg-white border-gray-100 shadow-sm hover:shadow-md'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ann.color }} />
                      <span className="text-[10px] font-black" style={{ color: accentColor }}>P{ann.pageIndex + 1}</span>
                    </div>
                    <span className="text-[9px] text-gray-400 font-bold">{new Date(ann.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className={`text-[11px] font-bold uppercase tracking-tight ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{ann.type}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default SidebarRight;
