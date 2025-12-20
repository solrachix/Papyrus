
import { DocumentEngine, TextItem, OutlineItem } from '../types';

/**
 * Base abstract class for any PDF engine implementation.
 * This ensures the UI only interacts with this interface.
 */
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
  abstract getTextContent(pageIndex: number): Promise<TextItem[]>;
  // Added missing abstract method to match DocumentEngine interface
  abstract getOutline(): Promise<OutlineItem[]>;
  // Added missing abstract method to match DocumentEngine interface
  abstract getPageIndex(dest: any): Promise<number | null>;
  abstract destroy(): void;
}