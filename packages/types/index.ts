
export type ViewMode = 'single' | 'double' | 'continuous';
export type UITheme = 'light' | 'dark';
export type PageTheme = 'normal' | 'sepia' | 'dark' | 'high-contrast';

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
  dest: any;
  items: OutlineItem[];
  pageIndex?: number;
}

export interface PapyrusConfig {
  initialPage?: number;
  initialZoom?: number;
  initialRotation?: number;
  initialViewMode?: ViewMode;
  initialUITheme?: UITheme;
  initialPageTheme?: PageTheme;
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
 * Interface principal do Motor de Documentos.
 * Qualquer implementação (PDF.js, Imagens, Office) deve seguir este contrato.
 */
export interface DocumentEngine {
  load(source: File | ArrayBuffer | string): Promise<void>;
  getPageCount(): number;
  getCurrentPage(): number;
  goToPage(page: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  rotate(direction: 'clockwise' | 'counterclockwise'): void;
  getRotation(): number;
  renderPage(pageIndex: number, canvas: HTMLCanvasElement, scale: number): Promise<void>;
  /** Renderiza a camada de texto para seleção/copiar em um container específico */
  renderTextLayer(pageIndex: number, container: HTMLElement, scale: number): Promise<void>;
  getTextContent(pageIndex: number): Promise<TextItem[]>;
  getPageDimensions(pageIndex: number): Promise<{ width: number, height: number }>;
  getOutline(): Promise<OutlineItem[]>;
  getPageIndex(dest: any): Promise<number | null>;
  destroy(): void;
}
