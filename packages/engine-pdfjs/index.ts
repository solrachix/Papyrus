
import { BaseDocumentEngine } from '../core/engine';
import { TextItem, OutlineItem } from '../types/index';

declare const pdfjsLib: any;

export class PDFJSEngine extends BaseDocumentEngine {
  private pdfDoc: any = null;
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;

  async load(source: File | ArrayBuffer | string): Promise<void> {
    try {
      let data: any = source;
      if (source instanceof File) data = await source.arrayBuffer();
      this.pdfDoc = await pdfjsLib.getDocument(data).promise;
      this.currentPage = 1;
    } catch (error) { 
      console.error("[PDFJSEngine] Erro ao carregar:", error);
      throw error; 
    }
  }

  getPageCount(): number { return this.pdfDoc ? this.pdfDoc.numPages : 0; }
  getCurrentPage(): number { return this.currentPage; }
  goToPage(page: number): void { if (page >= 1 && page <= this.getPageCount()) this.currentPage = page; }
  setZoom(zoom: number): void { this.zoom = Math.max(0.1, Math.min(5.0, zoom)); }
  getZoom(): number { return this.zoom; }
  
  rotate(direction: 'clockwise' | 'counterclockwise'): void {
    if (direction === 'clockwise') this.rotation = (this.rotation + 90) % 360;
    else { this.rotation = (this.rotation - 90) % 360; if (this.rotation < 0) this.rotation += 360; }
  }
  
  getRotation(): number { return this.rotation; }

  async getPageDimensions(pageIndex: number): Promise<{ width: number, height: number }> {
    if (!this.pdfDoc) return { width: 0, height: 0 };
    const page = await this.pdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  async renderPage(pageIndex: number, target: any, scale: number): Promise<void> {
    const canvas = target as HTMLCanvasElement;
    if (!this.pdfDoc || !canvas) return;
    
    const page = await this.pdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: scale * this.zoom, rotation: this.rotation });
    
    canvas.height = viewport.height; 
    canvas.width = viewport.width;
    
    const context = canvas.getContext('2d');
    if (!context) return;

    await page.render({ canvasContext: context, viewport }).promise;
  }

  async renderTextLayer(pageIndex: number, container: any, scale: number): Promise<void> {
    const element = container as HTMLElement;
    if (!this.pdfDoc || !element) return;
    
    const page = await this.pdfDoc.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: scale * this.zoom, rotation: this.rotation });
    const textContentSource = await page.getTextContent();
    
    element.style.width = `${viewport.width}px`;
    element.style.height = `${viewport.height}px`;
    element.style.setProperty('--scale-factor', viewport.scale.toString());
    
    await pdfjsLib.renderTextLayer({
      textContentSource,
      container: element,
      viewport,
      textDivs: []
    }).promise;
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
      const d = typeof dest === 'string' ? await this.pdfDoc.getDestination(dest) : dest;
      return await this.pdfDoc.getPageIndex(d[0]);
    } catch (e) { return null; }
  }

  destroy(): void { if (this.pdfDoc) { this.pdfDoc.destroy(); this.pdfDoc = null; } }
}
