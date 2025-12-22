
export type ViewMode = 'single' | 'double' | 'continuous';
export type UITheme = 'light' | 'dark';
export type PageTheme = 'normal' | 'sepia' | 'dark' | 'high-contrast';
export type Locale = 'en' | 'pt-BR';

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

export interface Annotation {
  id: string;
  type: 'highlight' | 'text' | 'strikeout' | 'comment';
  pageIndex: number;
  content?: string;
  rect: { x: number; y: number; width: number; height: number };
  color: string;
  createdAt: number;
}

export interface OutlineItem {
  title: string;
  pageIndex: number;
  children?: OutlineItem[];
}

export interface PapyrusConfig {
  initialPage?: number;
  initialZoom?: number;
  initialRotation?: number;
  initialViewMode?: ViewMode;
  initialUITheme?: UITheme;
  initialPageTheme?: PageTheme;
  initialLocale?: Locale;
  initialAnnotations?: Annotation[];
  sidebarLeftOpen?: boolean;
  sidebarRightOpen?: boolean;
}

export enum PapyrusEventType {
  DOCUMENT_LOADED = 'DOCUMENT_LOADED',
  PAGE_CHANGED = 'PAGE_CHANGED',
  ZOOM_CHANGED = 'ZOOM_CHANGED',
  ANNOTATION_CREATED = 'ANNOTATION_CREATED',
  ANNOTATION_DELETED = 'ANNOTATION_DELETED',
  SEARCH_TRIGGERED = 'SEARCH_TRIGGERED',
  TEXT_SELECTED = 'TEXT_SELECTED',
}

export interface EventPayloads {
  [PapyrusEventType.DOCUMENT_LOADED]: { pageCount: number };
  [PapyrusEventType.PAGE_CHANGED]: { pageNumber: number };
  [PapyrusEventType.ZOOM_CHANGED]: { zoom: number };
  [PapyrusEventType.ANNOTATION_CREATED]: { annotation: Annotation };
  [PapyrusEventType.ANNOTATION_DELETED]: { annotationId: string };
  [PapyrusEventType.SEARCH_TRIGGERED]: { query: string };
  [PapyrusEventType.TEXT_SELECTED]: { text: string, pageIndex: number };
}

export type PapyrusEventListener<T extends PapyrusEventType> = (payload: EventPayloads[T]) => void;

/**
 * Interface agnóstica do Motor.
 * A UI interage apenas com estes métodos.
 */
export interface DocumentEngine {
  load(source: DocumentSource): Promise<void>;
  getPageCount(): number;
  getCurrentPage(): number;
  goToPage(page: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  rotate(direction: 'clockwise' | 'counterclockwise'): void;
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
  renderTextLayer(pageIndex: number, container: any, scale: number): Promise<void>;
  
  getTextContent(pageIndex: number): Promise<TextItem[]>;
  getPageDimensions(pageIndex: number): Promise<{ width: number, height: number }>;
  searchText?(query: string): Promise<SearchResult[]>;
  selectText?(pageIndex: number, rect: { x: number; y: number; width: number; height: number }): Promise<TextSelection | null>;
  getOutline(): Promise<OutlineItem[]>;
  getPageIndex(dest: any): Promise<number | null>;
  destroy(): void;
}
