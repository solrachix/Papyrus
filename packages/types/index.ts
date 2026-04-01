export type ViewMode = "single" | "double" | "continuous";
export type UITheme = "light" | "dark";
export type PageTheme = "normal" | "sepia" | "dark" | "high-contrast";
export type Locale = "en" | "pt-BR";
export type RenderTargetType = "canvas" | "element" | "webview";

export interface FileLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type DocumentSource =
  | ArrayBuffer
  | Uint8Array
  | string
  | { uri: string }
  | { data: ArrayBuffer | Uint8Array }
  | FileLike;

export type DocumentType = "pdf" | "epub" | "text";

export type ReadingMode =
  | "focus"
  | "controlsVisible"
  | "readingDimmed"
  | "modalSurfaceOpen"
  | "annotate";

export type ActiveSurface =
  | "none"
  | "search"
  | "jump"
  | "outline"
  | "thumbnails"
  | "comments"
  | "info"
  | "documentActions"
  | "theme";

export type MobilePrimaryDestination =
  | "none"
  | "pages"
  | "contents"
  | "progress"
  | "search"
  | "notes"
  | "display"
  | "info"
  | "documentActions"
  | "annotate";

export interface MobileShellState {
  activeMobileDestination: MobilePrimaryDestination;
  mobileKeyboardOpen: boolean;
  mobileDockVisible: boolean;
  mobileProgressPillVisible: boolean;
}

export interface DocumentLocation {
  kind: "page" | "section" | "progress" | "range";
  label: string;
  primaryValue: number | string;
  secondaryValue?: number | string;
  engineTarget?: unknown;
}

export type NavigationTarget = DocumentLocation;

export interface ReaderCapabilities {
  "search.text"?: boolean;
  "navigation.page"?: boolean;
  "navigation.section"?: boolean;
  "documentActions.share"?: boolean;
  "documentActions.export"?: boolean;
}

export interface CapabilityState {
  status: "unknown" | "ready" | "partial";
  values: ReaderCapabilities;
  errors: string[];
}

export interface DocumentLoadRequest {
  type: DocumentType;
  source: DocumentSource;
}

export type DocumentLoadInput = DocumentSource | DocumentLoadRequest;

export interface TextItem {
  str: string;
  dir: string;
  width: number;
  height: number;
  transform: number[];
  fontName: string;
}

export interface SearchResult {
  pageIndex: number;
  text: string;
  matchIndex: number;
  rects?: { x: number; y: number; width: number; height: number }[];
}

export interface TextSelection {
  text: string;
  rects: { x: number; y: number; width: number; height: number }[];
}

export interface AnnotationReply {
  id: string;
  annotationId: string;
  content: string;
  createdAt: number;
}

export interface Annotation {
  id: string;
  type:
    | "highlight"
    | "underline"
    | "squiggly"
    | "strikeout"
    | "text"
    | "comment"
    | "ink";
  pageIndex: number;
  content?: string;
  rect: { x: number; y: number; width: number; height: number };
  rects?: { x: number; y: number; width: number; height: number }[];
  path?: { x: number; y: number }[];
  color: string;
  createdAt: number;
  updatedAt?: number;
  replies?: AnnotationReply[];
}

export interface OutlineItem {
  title: string;
  pageIndex: number;
  dest?: PageDestination;
  children?: OutlineItem[];
}

export type PageDestination =
  | string
  | { kind: "pageIndex"; value: number }
  | { kind: "pageNumber"; value: number }
  | { kind: "named"; value: string }
  | { kind: "href"; value: string };

export interface PapyrusConfig {
  initialPage?: number;
  initialZoom?: number;
  initialRotation?: number;
  initialViewMode?: ViewMode;
  initialUITheme?: UITheme;
  initialPageTheme?: PageTheme;
  initialAccentColor?: string;
  initialLocale?: Locale;
  initialAnnotations?: Annotation[];
  sidebarLeftOpen?: boolean;
  sidebarRightOpen?: boolean;
}

export enum PapyrusEventType {
  DOCUMENT_LOADED = "DOCUMENT_LOADED",
  PAGE_CHANGED = "PAGE_CHANGED",
  ZOOM_CHANGED = "ZOOM_CHANGED",
  ANNOTATION_CREATED = "ANNOTATION_CREATED",
  ANNOTATION_UPDATED = "ANNOTATION_UPDATED",
  ANNOTATION_DELETED = "ANNOTATION_DELETED",
  ANNOTATION_REPLY_ADDED = "ANNOTATION_REPLY_ADDED",
  SEARCH_TRIGGERED = "SEARCH_TRIGGERED",
  TEXT_SELECTED = "TEXT_SELECTED",
}

export interface EventPayloads {
  [PapyrusEventType.DOCUMENT_LOADED]: { pageCount: number };
  [PapyrusEventType.PAGE_CHANGED]: { pageNumber: number };
  [PapyrusEventType.ZOOM_CHANGED]: { zoom: number };
  [PapyrusEventType.ANNOTATION_CREATED]: { annotation: Annotation };
  [PapyrusEventType.ANNOTATION_UPDATED]: { annotation: Annotation };
  [PapyrusEventType.ANNOTATION_DELETED]: { annotationId: string };
  [PapyrusEventType.ANNOTATION_REPLY_ADDED]: {
    annotationId: string;
    reply: AnnotationReply;
    annotation: Annotation;
  };
  [PapyrusEventType.SEARCH_TRIGGERED]: { query: string };
  [PapyrusEventType.TEXT_SELECTED]: { text: string; pageIndex: number };
}

export type PapyrusEventListener<T extends PapyrusEventType> = (
  payload: EventPayloads[T]
) => void;

/**
 * Interface agnóstica do Motor.
 * A UI interage apenas com estes métodos.
 */
export interface DocumentEngine {
  load(source: DocumentSource): Promise<void>;
  load(request: DocumentLoadRequest): Promise<void>;
  getPageCount(): number;
  getCurrentPage(): number;
  goToPage(page: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  rotate(direction: "clockwise" | "counterclockwise"): void;
  getRotation(): number;

  /**
   * Renderiza o conteúdo visual da página.
   * target: HTMLCanvasElement no Web ou NativeHandle no RN.
   */
  renderPage(pageIndex: number, target: any, scale: number): Promise<void>;

  /**
   * Renderiza a camada de texto para seleção.
   * container: HTMLElement no Web ou GhostView no RN.
   */
  renderTextLayer(
    pageIndex: number,
    container: any,
    scale: number
  ): Promise<void>;

  getTextContent(pageIndex: number): Promise<TextItem[]>;
  getPageDimensions(
    pageIndex: number
  ): Promise<{ width: number; height: number }>;
  searchText?(query: string): Promise<SearchResult[]>;
  selectText?(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null>;
  getOutline(): Promise<OutlineItem[]>;
  getPageIndex(dest: PageDestination): Promise<number | null>;
  getRenderTargetType?(): RenderTargetType;
  destroy(): void;
}
