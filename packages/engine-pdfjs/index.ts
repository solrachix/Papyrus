
import { BaseDocumentEngine } from '@papyrus-sdk/core';
import { DocumentLoadInput, DocumentLoadRequest, DocumentSource, DocumentType, TextItem, OutlineItem, FileLike, TextSelection } from '@papyrus-sdk/types';

declare const pdfjsLib: any;

export class PDFJSEngine extends BaseDocumentEngine {
  private pdfDoc: any = null;
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;
  private renderTasks = new WeakMap<HTMLCanvasElement, any>();

  async load(input: DocumentLoadInput): Promise<void> {
    try {
      const { source, type } = this.normalizeLoadInput(input);
      if (type && type !== 'pdf') {
        throw new Error(`[PDFJSEngine] Tipo de documento não suportado: ${type}`);
      }

      const data = await this.resolveSource(source);

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

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null> {
    void pageIndex;
    void rect;
    return null;
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

    const previousTask = this.renderTasks.get(canvas);
    if (previousTask?.cancel) {
      try { previousTask.cancel(); } catch { /* ignore */ }
    }

    const renderTask = page.render({ canvasContext: context, viewport });
    this.renderTasks.set(canvas, renderTask);
    try {
      await renderTask.promise;
    } catch (error: any) {
      if (error?.name === 'RenderingCancelledException') return;
      throw error;
    }
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
    if (!outline || outline.length === 0) return [];

    const mapOutline = async (items: any[]): Promise<OutlineItem[]> => {
      const mapped = await Promise.all(
        items.map(async (item) => {
          const title = item.title || '';
          let pageIndex = -1;

          if (item.dest) {
            try {
              const dest = typeof item.dest === 'string' ? await this.pdfDoc.getDestination(item.dest) : item.dest;
              if (dest && dest[0]) {
                pageIndex = await this.pdfDoc.getPageIndex(dest[0]);
              }
            } catch {
              pageIndex = -1;
            }
          }

          const children = item.items ? await mapOutline(item.items) : [];
          const outlineItem: OutlineItem = { title, pageIndex };
          if (children.length > 0) outlineItem.children = children;
          return outlineItem;
        })
      );

      return mapped;
    };

    return mapOutline(outline);
  }

  async getPageIndex(dest: any): Promise<number | null> {
    if (!this.pdfDoc || !dest) return null;
    try {
      const d = typeof dest === 'string' ? await this.pdfDoc.getDestination(dest) : dest;
      return await this.pdfDoc.getPageIndex(d[0]);
    } catch (e) { return null; }
  }

  destroy(): void { if (this.pdfDoc) { this.pdfDoc.destroy(); this.pdfDoc = null; } }

  private isUriSource(source: DocumentSource): source is { uri: string } {
    return typeof source === 'object' && source !== null && 'uri' in source;
  }

  private isDataSource(source: DocumentSource): source is { data: ArrayBuffer | Uint8Array } {
    return typeof source === 'object' && source !== null && 'data' in source;
  }

  private isFileLike(source: DocumentSource): source is FileLike {
    return typeof source === 'object' && source !== null && typeof (source as FileLike).arrayBuffer === 'function';
  }

  private normalizeLoadInput(input: DocumentLoadInput): { source: DocumentSource; type?: DocumentType } {
    if (this.isLoadRequest(input)) {
      return { source: input.source, type: input.type };
    }
    return { source: input };
  }

  private isLoadRequest(input: DocumentLoadInput): input is DocumentLoadRequest {
    return typeof input === 'object' && input !== null && 'source' in input && 'type' in input;
  }

  private async resolveSource(source: DocumentSource): Promise<any> {
    if (typeof source === 'string') {
      const dataUri = this.parseDataUri(source);
      if (dataUri) {
        return dataUri.isBase64 ? this.decodeBase64(dataUri.data) : dataUri.data;
      }
      if (this.looksLikeUri(source)) {
        return source;
      }
      if (this.isLikelyBase64(source)) {
        return this.decodeBase64(source);
      }
      return source;
    }
    if (this.isUriSource(source)) return source.uri;
    if (this.isDataSource(source)) return source.data;
    if (this.isFileLike(source)) return await source.arrayBuffer();
    return source;
  }

  private parseDataUri(value: string): { isBase64: boolean; data: string } | null {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(value);
    if (!match) return null;
    const isBase64 = Boolean(match[2]);
    const data = match[3] ?? '';
    return { isBase64, data };
  }

  private decodeBase64(value: string): Uint8Array {
    const clean = value.replace(/\s/g, '');
    if (typeof atob !== 'function') {
      throw new Error('[PDFJSEngine] atob não está disponível para decodificar base64.');
    }
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private looksLikeUri(value: string): boolean {
    return (
      value.startsWith('http://') ||
      value.startsWith('https://') ||
      value.startsWith('/') ||
      value.startsWith('./') ||
      value.startsWith('../') ||
      value.startsWith('file://')
    );
  }

  private isLikelyBase64(value: string): boolean {
    if (this.looksLikeUri(value)) return false;
    if (value.includes('.')) return false;
    if (value.length < 16) return false;
    return /^[A-Za-z0-9+/=]+$/.test(value);
  }
}
