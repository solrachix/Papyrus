
import { create } from 'zustand';
import { ViewMode, Annotation, SearchResult, UITheme, PageTheme, OutlineItem } from '../types';

interface ViewerState {
  // Document State
  isLoaded: boolean;
  pageCount: number;
  currentPage: number;
  zoom: number;
  rotation: number;
  viewMode: ViewMode;
  uiTheme: UITheme;
  pageTheme: PageTheme;
  outline: OutlineItem[];
  
  // UI State
  sidebarLeftOpen: boolean;
  sidebarLeftTab: 'thumbnails' | 'summary';
  outlineSearchQuery: string;
  sidebarRightOpen: boolean;
  sidebarRightTab: 'search' | 'annotations';
  searchQuery: string;
  searchResults: SearchResult[];
  activeSearchIndex: number;
  scrollToPageSignal: number | null;
  
  // Annotations
  annotations: Annotation[];
  activeTool: 'select' | 'highlight' | 'text' | 'strikeout' | 'comment';
  selectedAnnotationId: string | null;

  // Actions
  setDocumentState: (state: Partial<ViewerState>) => void;
  toggleSidebarLeft: () => void;
  setSidebarLeftTab: (tab: 'thumbnails' | 'summary') => void;
  setOutlineSearch: (query: string) => void;
  toggleSidebarRight: (tab?: 'search' | 'annotations') => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  setSelectedAnnotation: (id: string | null) => void;
  setSearch: (query: string, results: SearchResult[]) => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;
  triggerScrollToPage: (pageIndex: number) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  isLoaded: false,
  pageCount: 0,
  currentPage: 1,
  zoom: 1.0,
  rotation: 0,
  viewMode: 'continuous',
  uiTheme: 'light',
  pageTheme: 'normal',
  outline: [],
  
  sidebarLeftOpen: true,
  sidebarLeftTab: 'thumbnails',
  outlineSearchQuery: '',
  sidebarRightOpen: false,
  sidebarRightTab: 'search',
  searchQuery: '',
  searchResults: [],
  activeSearchIndex: -1,
  scrollToPageSignal: null,
  
  annotations: [],
  activeTool: 'select',
  selectedAnnotationId: null,

  setDocumentState: (state) => set((prev) => ({ ...prev, ...state })),
  
  toggleSidebarLeft: () => set((state) => ({ sidebarLeftOpen: !state.sidebarLeftOpen })),
  setSidebarLeftTab: (tab) => set({ sidebarLeftTab: tab }),
  setOutlineSearch: (query) => set({ outlineSearchQuery: query }),
  
  toggleSidebarRight: (tab) => set((state) => ({ 
    sidebarRightOpen: tab ? true : !state.sidebarRightOpen,
    sidebarRightTab: tab || state.sidebarRightTab 
  })),

  addAnnotation: (ann) => set((state) => ({ 
    annotations: [...state.annotations, ann],
    selectedAnnotationId: ann.id
  })),

  updateAnnotation: (id, updates) => set((state) => ({
    annotations: state.annotations.map(a => a.id === id ? { ...a, ...updates } : a)
  })),

  removeAnnotation: (id) => set((state) => ({ 
    annotations: state.annotations.filter(a => a.id !== id),
    selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId
  })),

  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),

  setSearch: (query, results) => set({ 
    searchQuery: query, 
    searchResults: results, 
    activeSearchIndex: results.length > 0 ? 0 : -1,
  }),
  
  nextSearchResult: () => set((state) => {
    if (state.searchResults.length === 0) return state;
    const nextIndex = (state.activeSearchIndex + 1) % state.searchResults.length;
    const pageIndex = state.searchResults[nextIndex].pageIndex;
    return { 
      activeSearchIndex: nextIndex,
      scrollToPageSignal: pageIndex,
      currentPage: pageIndex + 1
    };
  }),
  
  prevSearchResult: () => set((state) => {
    if (state.searchResults.length === 0) return state;
    const prevIndex = (state.activeSearchIndex - 1 + state.searchResults.length) % state.searchResults.length;
    const pageIndex = state.searchResults[prevIndex].pageIndex;
    return { 
      activeSearchIndex: prevIndex,
      scrollToPageSignal: pageIndex,
      currentPage: pageIndex + 1
    };
  }),

  triggerScrollToPage: (pageIndex) => set({ scrollToPageSignal: pageIndex, currentPage: pageIndex + 1 }),
}));
