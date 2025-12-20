
import { DocumentEngine, TextItem, OutlineItem } from '../types/index';

export abstract class BaseDocumentEngine implements DocumentEngine {
  abstract load(source: File | ArrayBuffer | string): Promise<void>;
  abstract getPageCount(): number;
  abstract getCurrentPage(): number;
  abstract goToPage(page: number): void;
  abstract setZoom(zoom: number): void;
  abstract getZoom(): number;
  abstract rotate(direction: 'clockwise' | 'counterclockwise'): void;
  abstract getRotation(): number;
  abstract renderPage(pageIndex: number, canvas: HTMLCanvasElement, scale: number): Promise<void>;
  // Added missing abstract method required by DocumentEngine interface in packages/types/index.ts
  abstract renderTextLayer(pageIndex: number, container: HTMLElement, scale: number): Promise<void>;
  abstract getTextContent(pageIndex: number): Promise<TextItem[]>;
  // Fix: Added missing abstract method required by DocumentEngine interface in packages/types/index.ts
  abstract getPageDimensions(pageIndex: number): Promise<{ width: number, height: number }>;
  abstract getOutline(): Promise<OutlineItem[]>;
  abstract getPageIndex(dest: any): Promise<number | null>;
  abstract destroy(): void;
}
