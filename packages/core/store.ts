
import { create } from 'zustand';
import { ViewMode, Annotation, SearchResult, UITheme, PageTheme, OutlineItem, PapyrusEventType, PapyrusConfig, Locale } from '@papyrus/types';
import { papyrusEvents } from './services/event-emitter';

interface ViewerState {
  isLoaded: boolean;
  pageCount: number;
  currentPage: number;
  zoom: number;
  rotation: number;
  viewMode: ViewMode;
  uiTheme: UITheme;
  pageTheme: PageTheme;
  locale: Locale;
  accentColor: string;
  annotationColor: string;
  outline: OutlineItem[];
  sidebarLeftOpen: boolean;
  sidebarLeftTab: 'thumbnails' | 'summary';
  outlineSearchQuery: string;
  sidebarRightOpen: boolean;
  sidebarRightTab: 'search' | 'annotations' | 'pages';
  searchQuery: string;
  searchResults: SearchResult[];
  activeSearchIndex: number;
  scrollToPageSignal: number | null;
  annotations: Annotation[];
  activeTool: 'select' | 'highlight' | 'text' | 'strikeout' | 'comment';
  selectedAnnotationId: string | null;
  interactionMode: 'pan' | 'select';
  selectionActive: boolean;

  initializeStore: (config: PapyrusConfig) => void;
  setDocumentState: (state: Partial<ViewerState>) => void;
  toggleSidebarLeft: () => void;
  setSidebarLeftTab: (tab: 'thumbnails' | 'summary') => void;
  setOutlineSearch: (query: string) => void;
  toggleSidebarRight: (tab?: 'search' | 'annotations' | 'pages') => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  setSelectedAnnotation: (id: string | null) => void;
  setSearch: (query: string, results: SearchResult[]) => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;
  triggerScrollToPage: (pageIndex: number) => void;
  setAnnotationColor: (color: string) => void;
  setInteractionMode: (mode: 'pan' | 'select') => void;
  setSelectionActive: (active: boolean) => void;
  setAccentColor: (color: string) => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  isLoaded: false,
  pageCount: 0,
  currentPage: 1,
  zoom: 1.0,
  rotation: 0,
  viewMode: 'continuous',
  uiTheme: 'light',
  pageTheme: 'normal',
  locale: 'en',
  accentColor: '#2563eb',
  annotationColor: '#fbbf24',
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
  interactionMode: 'pan',
  selectionActive: false,

  initializeStore: (config) => set((state) => ({
    ...state,
    currentPage: config.initialPage ?? state.currentPage,
    zoom: config.initialZoom ?? state.zoom,
    rotation: config.initialRotation ?? state.rotation,
    viewMode: config.initialViewMode ?? state.viewMode,
    uiTheme: config.initialUITheme ?? state.uiTheme,
    pageTheme: config.initialPageTheme ?? state.pageTheme,
    locale: config.initialLocale ?? state.locale,
    accentColor: config.initialAccentColor ?? state.accentColor,
    annotations: config.initialAnnotations ?? state.annotations,
    sidebarLeftOpen: config.sidebarLeftOpen ?? state.sidebarLeftOpen,
    sidebarRightOpen: config.sidebarRightOpen ?? state.sidebarRightOpen,
  })),

  setDocumentState: (state) => {
    const oldPage = get().currentPage;
    const oldZoom = get().zoom;
    
    set((prev) => ({ ...prev, ...state }));

    if (state.currentPage !== undefined && state.currentPage !== oldPage) {
      papyrusEvents.emit(PapyrusEventType.PAGE_CHANGED, { pageNumber: state.currentPage });
    }
    if (state.zoom !== undefined && state.zoom !== oldZoom) {
      papyrusEvents.emit(PapyrusEventType.ZOOM_CHANGED, { zoom: state.zoom });
    }
    if (state.isLoaded === true) {
      papyrusEvents.emit(PapyrusEventType.DOCUMENT_LOADED, { pageCount: get().pageCount });
    }
  },

  toggleSidebarLeft: () => set((state) => ({ sidebarLeftOpen: !state.sidebarLeftOpen })),
  setSidebarLeftTab: (tab) => set({ sidebarLeftTab: tab }),
  setOutlineSearch: (query) => set({ outlineSearchQuery: query }),
  toggleSidebarRight: (tab) => set((state) => ({ 
    sidebarRightOpen: tab ? true : !state.sidebarRightOpen,
    sidebarRightTab: tab || state.sidebarRightTab 
  })),
  setAnnotationColor: (color) => set({ annotationColor: color }),

  addAnnotation: (ann) => {
    set((state) => ({ annotations: [...state.annotations, ann], selectedAnnotationId: ann.id }));
    papyrusEvents.emit(PapyrusEventType.ANNOTATION_CREATED, { annotation: ann });
  },

  updateAnnotation: (id, updates) => set((state) => ({
    annotations: state.annotations.map(a => a.id === id ? { ...a, ...updates } : a)
  })),

  removeAnnotation: (id) => {
    set((state) => ({ 
      annotations: state.annotations.filter(a => a.id !== id),
      selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId
    }));
    papyrusEvents.emit(PapyrusEventType.ANNOTATION_DELETED, { annotationId: id });
  },

  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  setSelectionActive: (active) => set({ selectionActive: active }),
  setAccentColor: (color) => set({ accentColor: color }),
  
  setSearch: (query, results) => {
    set({ searchQuery: query, searchResults: results, activeSearchIndex: results.length > 0 ? 0 : -1 });
    papyrusEvents.emit(PapyrusEventType.SEARCH_TRIGGERED, { query });
  },

  nextSearchResult: () => {
    const state = get();
    if (state.searchResults.length === 0) return;
    const nextIndex = (state.activeSearchIndex + 1) % state.searchResults.length;
    const pageIndex = state.searchResults[nextIndex].pageIndex;
    set({ activeSearchIndex: nextIndex, scrollToPageSignal: pageIndex, currentPage: pageIndex + 1 });
  },

  prevSearchResult: () => {
    const state = get();
    if (state.searchResults.length === 0) return;
    const prevIndex = (state.activeSearchIndex - 1 + state.searchResults.length) % state.searchResults.length;
    const pageIndex = state.searchResults[prevIndex].pageIndex;
    set({ activeSearchIndex: prevIndex, scrollToPageSignal: pageIndex, currentPage: pageIndex + 1 });
  },

  triggerScrollToPage: (pageIndex) => set({ scrollToPageSignal: pageIndex, currentPage: pageIndex + 1 }),
}));
