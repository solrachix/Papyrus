
import { BaseDocumentEngine } from '../core/engine';
import { TextItem, OutlineItem } from '../types';

declare const pdfjsLib: any;

export class PDFJSEngine extends BaseDocumentEngine {
  private pdfDoc: any = null;
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;

  async load(source: File | ArrayBuffer | string): Promise<void> {
    try {
      let data: any = source;
      if (source instanceof File) {
        data = await source.arrayBuffer();
      }
      this.pdfDoc = await pdfjsLib.getDocument(data).promise;
      this.currentPage = 1;
    } catch (error) {
      console.error('Failed to load document:', error);
      throw error;
    }
  }

  getPageCount(): number {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.getPageCount()) {
      this.currentPage = page;
    }
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.1, Math.min(5.0, zoom));
  }

  getZoom(): number {
    return this.zoom;
  }

  rotate(direction: 'clockwise' | 'counterclockwise'): void {
    if (direction === 'clockwise') {
      this.rotation = (this.rotation + 90) % 360;
    } else {
      this.rotation = (this.rotation - 90) % 360;
      if (this.rotation < 0) this.rotation += 360;
    }
  }

  getRotation(): number {
    return this.rotation;
  }

  async renderPage(pageIndex: number, canvas: HTMLCanvasElement, scale: number): Promise<void> {
    if (!this.pdfDoc) return;
    
    const page = await this.pdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: scale * this.zoom, rotation: this.rotation });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: canvas.getContext('2d'),
      viewport: viewport,
    };

    await page.render(renderContext).promise;
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    if (!this.pdfDoc) return [];
    const page = await this.pdfDoc.getPage(pageIndex + 1);
    const content = await page.getTextContent();
    return content.items.map((item: any) => ({
      str: item.str,
      dir: item.dir,
      width: item.width,
      height: item.height,
      transform: item.transform,
      fontName: item.fontName,
    }));
  }

  async getOutline(): Promise<OutlineItem[]> {
    if (!this.pdfDoc) return [];
    const outline = await this.pdfDoc.getOutline();
    return outline || [];
  }

  async getPageIndex(dest: any): Promise<number | null> {
    if (!this.pdfDoc || !dest) return null;
    try {
      if (typeof dest === 'string') {
        const d = await this.pdfDoc.getDestination(dest);
        const ref = d[0];
        return await this.pdfDoc.getPageIndex(ref);
      }
      const ref = dest[0];
      return await this.pdfDoc.getPageIndex(ref);
    } catch (e) {
      return null;
    }
  }

  destroy(): void {
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
  }
}
