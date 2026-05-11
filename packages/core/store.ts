import { create } from "zustand";
import {
  ViewMode,
  Annotation,
  AnnotationReply,
  SearchResult,
  UITheme,
  PageTheme,
  OutlineItem,
  ActiveSurface,
  CapabilityState,
  DocumentLocation,
  PapyrusEventType,
  PapyrusConfig,
  Locale,
  MobilePrimaryDestination,
  MobileShellState,
  PdfViewerMode,
  PdfVisiblePage,
  ReadingMode,
} from "@papyrus-sdk/types";
import { papyrusEvents } from "./services/event-emitter";

const perfNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const isMobilePerfEnabled = () => {
  const perfGlobal = (globalThis as Record<string, unknown>)
    .__PAPYRUS_MOBILE_PERF__;
  if (perfGlobal === true) return true;
  if (!perfGlobal || typeof perfGlobal !== "object") return false;
  return (perfGlobal as { enabled?: boolean }).enabled ?? true;
};

const logStorePerf = (event: string, payload: Record<string, unknown>) => {
  if (!isMobilePerfEnabled()) return;
  console.log(`[Papyrus Perf][CoreStore] ${event}`, payload);
};

let setDocumentStateWindowStart = 0;
let setDocumentStateCallsInWindow = 0;

interface ViewerState {
  isLoaded: boolean;
  pageCount: number;
  currentPage: number;
  zoom: number;
  rotation: number;
  viewMode: ViewMode;
  viewerMode: PdfViewerMode;
  uiTheme: UITheme;
  pageTheme: PageTheme;
  locale: Locale;
  accentColor: string;
  annotationColor: string;
  annotationOpacity: number;
  inkStrokeWidth: number;
  activeDrawToolPreset: "ink" | "highlight" | "underline";
  outline: OutlineItem[];
  sidebarLeftOpen: boolean;
  sidebarLeftTab: "thumbnails" | "summary";
  outlineSearchQuery: string;
  sidebarRightOpen: boolean;
  sidebarRightTab: "search" | "annotations" | "pages";
  searchQuery: string;
  searchResults: SearchResult[];
  activeSearchIndex: number;
  scrollToPageSignal: number | null;
  annotations: Annotation[];
  activeTool:
    | "select"
    | "highlight"
    | "underline"
    | "squiggly"
    | "strikeout"
    | "text"
    | "comment"
    | "ink";
  selectedAnnotationId: string | null;
  interactionMode: "pan" | "select";
  selectionActive: boolean;
  toolDockOpen: boolean;
  mobileChromeVisible: boolean;
  readingMode: ReadingMode;
  activeSurface: ActiveSurface;
  documentLocation: DocumentLocation;
  capabilityState: CapabilityState;
  activeMobileDestination: MobilePrimaryDestination;
  mobileKeyboardOpen: boolean;
  mobileDockVisible: boolean;
  mobileProgressPillVisible: boolean;
  visiblePages: PdfVisiblePage[];
  nativeViewportGestureActive: boolean;
  annotationUndoStack: Array<{
    annotations: Annotation[];
    selectedAnnotationId: string | null;
  }>;
  annotationRedoStack: Array<{
    annotations: Annotation[];
    selectedAnnotationId: string | null;
  }>;

  initializeStore: (config: PapyrusConfig) => void;
  setDocumentState: (state: Partial<ViewerState>) => void;
  toggleSidebarLeft: () => void;
  setSidebarLeftTab: (tab: "thumbnails" | "summary") => void;
  setOutlineSearch: (query: string) => void;
  toggleSidebarRight: (tab?: "search" | "annotations" | "pages") => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  addAnnotationReply: (annotationId: string, content: string) => void;
  removeAnnotation: (id: string) => void;
  setSelectedAnnotation: (id: string | null) => void;
  setSearch: (query: string, results: SearchResult[]) => void;
  nextSearchResult: () => void;
  prevSearchResult: () => void;
  triggerScrollToPage: (pageIndex: number) => void;
  setAnnotationColor: (color: string) => void;
  setAnnotationOpacity: (opacity: number) => void;
  setInkStrokeWidth: (width: number) => void;
  undoAnnotations: () => void;
  redoAnnotations: () => void;
  setInteractionMode: (mode: "pan" | "select") => void;
  setSelectionActive: (active: boolean) => void;
  setAccentColor: (color: string) => void;
  openActiveSurface: (surface: Exclude<ActiveSurface, "none">) => void;
  closeActiveSurface: () => void;
  setDocumentLocation: (location: DocumentLocation) => void;
  setCapabilityState: (capabilityState: CapabilityState) => void;
  openMobileDestination: (destination: MobilePrimaryDestination) => void;
  closeMobileDestination: () => void;
  setMobileKeyboardOpen: (open: boolean) => void;
}

const getDefaultCapabilityState = (): CapabilityState => ({
  status: "unknown",
  values: {},
  errors: [],
});

const getDefaultViewerState = () => ({
  isLoaded: false,
  pageCount: 0,
  currentPage: 1,
  zoom: 1.0,
  rotation: 0,
  viewMode: "continuous" as ViewMode,
  viewerMode: "compat" as PdfViewerMode,
  uiTheme: "light" as UITheme,
  pageTheme: "normal" as PageTheme,
  locale: "en" as Locale,
  accentColor: "#2563eb",
  annotationColor: "#fbbf24",
  annotationOpacity: 1,
  inkStrokeWidth: 0.006,
  outline: [] as OutlineItem[],
  sidebarLeftOpen: true,
  sidebarLeftTab: "thumbnails" as const,
  outlineSearchQuery: "",
  sidebarRightOpen: false,
  sidebarRightTab: "search" as const,
  searchQuery: "",
  searchResults: [] as SearchResult[],
  activeSearchIndex: -1,
  scrollToPageSignal: null as number | null,
  annotations: [] as Annotation[],
  activeTool: "select" as const,
  activeDrawToolPreset: "ink" as const,
  selectedAnnotationId: null as string | null,
  interactionMode: "pan" as const,
  selectionActive: false,
  toolDockOpen: false,
  mobileChromeVisible: true,
  readingMode: "focus" as ReadingMode,
  activeSurface: "none" as ActiveSurface,
  documentLocation: {
    kind: "page" as const,
    label: "1/0",
    primaryValue: 1,
    secondaryValue: 0,
  } satisfies DocumentLocation,
  capabilityState: getDefaultCapabilityState(),
  activeMobileDestination: "none" as MobilePrimaryDestination,
  mobileKeyboardOpen: false,
  mobileDockVisible: true,
  mobileProgressPillVisible: true,
  visiblePages: [] as PdfVisiblePage[],
  nativeViewportGestureActive: false,
  annotationUndoStack: [] as Array<{
    annotations: Annotation[];
    selectedAnnotationId: string | null;
  }>,
  annotationRedoStack: [] as Array<{
    annotations: Annotation[];
    selectedAnnotationId: string | null;
  }>,
});

const deriveMobileShellState = ({
  activeMobileDestination,
  mobileKeyboardOpen,
}: Pick<
  ViewerState,
  "activeMobileDestination" | "mobileKeyboardOpen"
>): MobileShellState => {
  const keyboardOwnsSurface =
    mobileKeyboardOpen && activeMobileDestination === "search";

  return {
    activeMobileDestination,
    mobileKeyboardOpen,
    mobileDockVisible: !keyboardOwnsSurface,
    mobileProgressPillVisible: !keyboardOwnsSurface,
  };
};

export const useViewerStore = create<ViewerState>((set, get) => ({
  ...getDefaultViewerState(),

  initializeStore: (config) =>
    set(() => {
      const defaults = getDefaultViewerState();
      return {
        ...defaults,
        currentPage: config.initialPage ?? defaults.currentPage,
        zoom: config.initialZoom ?? defaults.zoom,
        rotation: config.initialRotation ?? defaults.rotation,
        viewMode: config.initialViewMode ?? defaults.viewMode,
        viewerMode: config.viewerMode ?? defaults.viewerMode,
        uiTheme: config.initialUITheme ?? defaults.uiTheme,
        pageTheme: config.initialPageTheme ?? defaults.pageTheme,
        locale: config.initialLocale ?? defaults.locale,
        accentColor: config.initialAccentColor ?? defaults.accentColor,
        annotations: config.initialAnnotations ?? defaults.annotations,
        annotationUndoStack: defaults.annotationUndoStack,
        annotationRedoStack: defaults.annotationRedoStack,
        sidebarLeftOpen: config.sidebarLeftOpen ?? defaults.sidebarLeftOpen,
        sidebarRightOpen: config.sidebarRightOpen ?? defaults.sidebarRightOpen,
      };
    }),

  setDocumentState: (state) => {
    if (isMobilePerfEnabled()) {
      const now = perfNow();
      if (
        setDocumentStateWindowStart === 0 ||
        now - setDocumentStateWindowStart > 1000
      ) {
        setDocumentStateWindowStart = now;
        setDocumentStateCallsInWindow = 0;
      }

      setDocumentStateCallsInWindow += 1;
      if (setDocumentStateCallsInWindow === 12) {
        logStorePerf("setDocumentState.burst", {
          calls: setDocumentStateCallsInWindow,
          windowMs: Math.round(now - setDocumentStateWindowStart),
          keys: Object.keys(state),
        });
      }
    }

    const oldPage = get().currentPage;
    const oldZoom = get().zoom;

    set((prev) => {
      const nextState = { ...prev, ...state };
      if (
        state.activeMobileDestination !== undefined ||
        state.mobileKeyboardOpen !== undefined
      ) {
        Object.assign(
          nextState,
          deriveMobileShellState({
            activeMobileDestination: nextState.activeMobileDestination,
            mobileKeyboardOpen: nextState.mobileKeyboardOpen,
          })
        );
      }
      return nextState;
    });

    if (state.currentPage !== undefined && state.currentPage !== oldPage) {
      papyrusEvents.emit(PapyrusEventType.PAGE_CHANGED, {
        pageNumber: state.currentPage,
      });
    }
    if (state.zoom !== undefined && state.zoom !== oldZoom) {
      papyrusEvents.emit(PapyrusEventType.ZOOM_CHANGED, { zoom: state.zoom });
    }
    if (state.isLoaded === true) {
      papyrusEvents.emit(PapyrusEventType.DOCUMENT_LOADED, {
        pageCount: get().pageCount,
      });
    }
  },

  toggleSidebarLeft: () =>
    set((state) => ({ sidebarLeftOpen: !state.sidebarLeftOpen })),
  setSidebarLeftTab: (tab) => set({ sidebarLeftTab: tab }),
  setOutlineSearch: (query) => set({ outlineSearchQuery: query }),
  toggleSidebarRight: (tab) =>
    set((state) => ({
      sidebarRightOpen: tab ? true : !state.sidebarRightOpen,
      sidebarRightTab: tab || state.sidebarRightTab,
    })),
  setAnnotationColor: (color) => set({ annotationColor: color }),
  setAnnotationOpacity: (opacity) =>
    set({ annotationOpacity: Math.min(1, Math.max(0.1, opacity)) }),
  setInkStrokeWidth: (width) =>
    set({ inkStrokeWidth: Math.min(0.02, Math.max(0.0025, width)) }),

  addAnnotation: (ann) => {
    const shouldAutoSelect = ann.type === "text" || ann.type === "comment";
    set((state) => ({
      annotationUndoStack: [
        ...state.annotationUndoStack,
        {
          annotations: state.annotations,
          selectedAnnotationId: state.selectedAnnotationId,
        },
      ].slice(-50),
      annotationRedoStack: [],
      annotations: [...state.annotations, ann],
      selectedAnnotationId: shouldAutoSelect
        ? ann.id
        : state.selectedAnnotationId,
    }));
    papyrusEvents.emit(PapyrusEventType.ANNOTATION_CREATED, {
      annotation: ann,
    });
  },

  updateAnnotation: (id, updates) => {
    let updatedAnnotation: Annotation | null = null;
    set((state) => ({
      annotationUndoStack: [
        ...state.annotationUndoStack,
        {
          annotations: state.annotations,
          selectedAnnotationId: state.selectedAnnotationId,
        },
      ].slice(-50),
      annotationRedoStack: [],
      annotations: state.annotations.map((a) => {
        if (a.id !== id) return a;
        updatedAnnotation = {
          ...a,
          ...updates,
          updatedAt: Date.now(),
        };
        return updatedAnnotation;
      }),
    }));
    if (updatedAnnotation) {
      papyrusEvents.emit(PapyrusEventType.ANNOTATION_UPDATED, {
        annotation: updatedAnnotation,
      });
    }
  },

  addAnnotationReply: (annotationId, content) => {
    const nextContent = content.trim();
    if (!nextContent) return;

    const reply: AnnotationReply = {
      id: Math.random().toString(36).slice(2, 11),
      annotationId,
      content: nextContent,
      createdAt: Date.now(),
    };

    let updatedAnnotation: Annotation | null = null;
    set((state) => ({
      annotations: state.annotations.map((a) => {
        if (a.id !== annotationId) return a;
        const replies = [...(a.replies ?? []), reply];
        updatedAnnotation = {
          ...a,
          replies,
          updatedAt: Date.now(),
        };
        return updatedAnnotation;
      }),
    }));

    if (updatedAnnotation) {
      papyrusEvents.emit(PapyrusEventType.ANNOTATION_REPLY_ADDED, {
        annotationId,
        reply,
        annotation: updatedAnnotation,
      });
      papyrusEvents.emit(PapyrusEventType.ANNOTATION_UPDATED, {
        annotation: updatedAnnotation,
      });
    }
  },

  removeAnnotation: (id) => {
    set((state) => ({
      annotationUndoStack: [
        ...state.annotationUndoStack,
        {
          annotations: state.annotations,
          selectedAnnotationId: state.selectedAnnotationId,
        },
      ].slice(-50),
      annotationRedoStack: [],
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedAnnotationId:
        state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
    }));
    papyrusEvents.emit(PapyrusEventType.ANNOTATION_DELETED, {
      annotationId: id,
    });
  },

  undoAnnotations: () => {
    const state = get();
    const previous =
      state.annotationUndoStack[state.annotationUndoStack.length - 1];
    if (!previous) return;
    set({
      annotations: previous.annotations,
      selectedAnnotationId: previous.selectedAnnotationId,
      annotationUndoStack: state.annotationUndoStack.slice(0, -1),
      annotationRedoStack: [
        ...state.annotationRedoStack,
        {
          annotations: state.annotations,
          selectedAnnotationId: state.selectedAnnotationId,
        },
      ].slice(-50),
    });
  },

  redoAnnotations: () => {
    const state = get();
    const next = state.annotationRedoStack[state.annotationRedoStack.length - 1];
    if (!next) return;
    set({
      annotations: next.annotations,
      selectedAnnotationId: next.selectedAnnotationId,
      annotationRedoStack: state.annotationRedoStack.slice(0, -1),
      annotationUndoStack: [
        ...state.annotationUndoStack,
        {
          annotations: state.annotations,
          selectedAnnotationId: state.selectedAnnotationId,
        },
      ].slice(-50),
    });
  },

  setSelectedAnnotation: (id) => set({ selectedAnnotationId: id }),
  setInteractionMode: (mode) => set({ interactionMode: mode }),
  setSelectionActive: (active) => set({ selectionActive: active }),
  setAccentColor: (color) => set({ accentColor: color }),
  openActiveSurface: (surface) =>
    set({
      activeSurface: surface,
      readingMode: "modalSurfaceOpen",
      mobileChromeVisible: true,
    }),
  closeActiveSurface: () =>
    set({
      activeSurface: "none",
      readingMode: "controlsVisible",
    }),
  setDocumentLocation: (location) => set({ documentLocation: location }),
  setCapabilityState: (capabilityState) => set({ capabilityState }),
  openMobileDestination: (destination) =>
    set((state) => ({
      ...deriveMobileShellState({
        activeMobileDestination: destination,
        mobileKeyboardOpen: state.mobileKeyboardOpen,
      }),
    })),
  closeMobileDestination: () =>
    set((state) => ({
      ...deriveMobileShellState({
        activeMobileDestination: "none",
        mobileKeyboardOpen: state.mobileKeyboardOpen,
      }),
    })),
  setMobileKeyboardOpen: (open) =>
    set((state) => ({
      ...deriveMobileShellState({
        activeMobileDestination: state.activeMobileDestination,
        mobileKeyboardOpen: open,
      }),
    })),

  setSearch: (query, results) => {
    set({
      searchQuery: query,
      searchResults: results,
      activeSearchIndex: results.length > 0 ? 0 : -1,
    });
    papyrusEvents.emit(PapyrusEventType.SEARCH_TRIGGERED, { query });
  },

  nextSearchResult: () => {
    const state = get();
    if (state.searchResults.length === 0) return;
    const nextIndex =
      (state.activeSearchIndex + 1) % state.searchResults.length;
    const pageIndex = state.searchResults[nextIndex].pageIndex;
    set({
      activeSearchIndex: nextIndex,
      scrollToPageSignal: pageIndex,
      currentPage: pageIndex + 1,
    });
  },

  prevSearchResult: () => {
    const state = get();
    if (state.searchResults.length === 0) return;
    const prevIndex =
      (state.activeSearchIndex - 1 + state.searchResults.length) %
      state.searchResults.length;
    const pageIndex = state.searchResults[prevIndex].pageIndex;
    set({
      activeSearchIndex: prevIndex,
      scrollToPageSignal: pageIndex,
      currentPage: pageIndex + 1,
    });
  },

  triggerScrollToPage: (pageIndex) =>
    set({ scrollToPageSignal: pageIndex, currentPage: pageIndex + 1 }),
}));
