
import React, { useState } from 'react';
import { useViewerStore } from '../core/store';
import { SearchService } from '../services/search-service';
import { DocumentEngine } from '../types';

interface SidebarRightProps {
  engine: DocumentEngine;
}

const SidebarRight: React.FC<SidebarRightProps> = ({ engine }) => {
  const { 
    sidebarRightOpen, 
    sidebarRightTab, 
    toggleSidebarRight, 
    searchResults, 
    activeSearchIndex,
    uiTheme,
    setSearch,
    nextSearchResult,
    prevSearchResult,
    setDocumentState,
    triggerScrollToPage,
    annotations
  } = useViewerStore();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const searchService = new SearchService(engine);
  const isDark = uiTheme === 'dark';

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSearch('', []);
      return;
    }
    setIsSearching(true);
    const results = await searchService.search(query);
    setSearch(query, results);
    setIsSearching(false);
  };

  const jumpToResult = (index: number) => {
    const res = searchResults[index];
    setDocumentState({ activeSearchIndex: index });
    triggerScrollToPage(res.pageIndex);
  };

  if (!sidebarRightOpen) return null;

  return (
    <div className={`w-80 border-l flex flex-col h-full shrink-0 transition-colors duration-200 ${isDark ? 'bg-[#1a1a1a] border-[#333]' : 'bg-white border-gray-200'}`}>
      <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
        <div className="flex space-x-6">
          <button 
            onClick={() => toggleSidebarRight('search')}
            className={`text-xs font-bold uppercase tracking-wider transition-all border-b-2 pb-1 ${sidebarRightTab === 'search' ? 'text-blue-500 border-blue-500' : isDark ? 'text-gray-500 border-transparent' : 'text-gray-400 border-transparent'}`}
          >
            Search
          </button>
          <button 
            onClick={() => toggleSidebarRight('annotations')}
            className={`text-xs font-bold uppercase tracking-wider transition-all border-b-2 pb-1 ${sidebarRightTab === 'annotations' ? 'text-blue-500 border-blue-500' : isDark ? 'text-gray-500 border-transparent' : 'text-gray-400 border-transparent'}`}
          >
            Notes
          </button>
        </div>
        <button onClick={() => toggleSidebarRight()} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {sidebarRightTab === 'search' ? (
          <div className="space-y-6">
            <form onSubmit={handleSearch} className="relative group">
              <input 
                type="text" 
                className={`w-full rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-inner ${isDark ? 'bg-[#2a2a2a] text-white placeholder-gray-500 border-[#444]' : 'bg-gray-100 text-gray-800 border-transparent'}`} 
                placeholder="Find in document..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" className="absolute right-3 top-2.5 text-gray-400 group-hover:text-blue-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
            </form>

            {isSearching && (
              <div className="flex flex-col items-center justify-center py-10 opacity-50">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-3"></div>
                <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">Scanning Pages...</span>
              </div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <div className="space-y-3">
                <div className={`flex justify-between items-center text-[10px] font-bold uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <span>{searchResults.length} Results</span>
                  <div className="flex items-center space-x-3 bg-gray-500/10 px-2 py-1 rounded-md">
                    <button onClick={prevSearchResult} className="hover:text-blue-500 transition-colors">PREV</button>
                    <span className="text-blue-500">{activeSearchIndex + 1} / {searchResults.length}</span>
                    <button onClick={nextSearchResult} className="hover:text-blue-500 transition-colors">NEXT</button>
                  </div>
                </div>
                {searchResults.map((res, idx) => (
                  <div 
                    key={idx}
                    onClick={() => jumpToResult(idx)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer group ${idx === activeSearchIndex ? 'border-blue-500 bg-blue-500/10 shadow-lg' : isDark ? 'border-[#333] hover:border-[#555] bg-[#222]' : 'border-gray-100 hover:border-gray-200 bg-gray-50 hover:bg-white'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>PAGE {res.pageIndex + 1}</span>
                    </div>
                    <p className={`text-xs leading-relaxed italic ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>"...{res.text}..."</p>
                  </div>
                ))}
              </div>
            )}

            {!isSearching && query && searchResults.length === 0 && (
              <div className="text-center py-10 opacity-40">
                <p className="text-sm font-medium">No matches found for "{query}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
             <div className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Collections ({annotations.length})</div>
            {annotations.length === 0 ? (
              <div className="text-center py-16 opacity-30">
                <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                <p className="text-sm font-medium uppercase tracking-widest">Workspace Empty</p>
              </div>
            ) : (
              annotations.map(ann => (
                <div key={ann.id} className={`p-4 border rounded-xl transition-all shadow-sm ${isDark ? 'border-[#333] hover:border-[#444] bg-[#222]' : 'border-gray-100 hover:border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-blue-500">P{ann.pageIndex + 1}</span>
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ann.color }} />
                  </div>
                  <p className={`text-xs font-bold uppercase mb-1 ${isDark ? 'text-gray-300' : 'text-gray-800'}`}>{ann.type}</p>
                  {ann.content && <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{ann.content}</p>}
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
