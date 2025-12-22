
import { DocumentEngine, TextItem, OutlineItem, DocumentSource } from '../types/index';

export abstract class BaseDocumentEngine implements DocumentEngine {
  abstract load(source: DocumentSource): Promise<void>;
  abstract getPageCount(): number;
  abstract getCurrentPage(): number;
  abstract goToPage(page: number): void;
  abstract setZoom(zoom: number): void;
  abstract getZoom(): number;
  abstract rotate(direction: 'clockwise' | 'counterclockwise'): void;
  abstract getRotation(): number;
  abstract renderPage(pageIndex: number, target: any, scale: number): Promise<void>;
  abstract renderTextLayer(pageIndex: number, container: any, scale: number): Promise<void>;
  abstract getTextContent(pageIndex: number): Promise<TextItem[]>;
  abstract getPageDimensions(pageIndex: number): Promise<{ width: number, height: number }>;
  abstract getOutline(): Promise<OutlineItem[]>;
  abstract getPageIndex(dest: any): Promise<number | null>;
  abstract destroy(): void;
}
