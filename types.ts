
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
  getTextContent(pageIndex: number): Promise<TextItem[]>;
  getOutline(): Promise<OutlineItem[]>;
  getPageIndex(dest: any): Promise<number | null>;
  destroy(): void;
}
