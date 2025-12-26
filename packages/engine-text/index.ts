import { BaseDocumentEngine } from '@papyrus-sdk/core';
import { DocumentSource, TextItem, OutlineItem, FileLike, TextSelection } from '@papyrus-sdk/types';

export class TextEngine extends BaseDocumentEngine {
  private text = '';
  private pages: string[] = [];
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;
  private pageSizes = new Map<number, { width: number; height: number }>();

  getRenderTargetType(): 'element' { return 'element'; }

  async load(source: DocumentSource): Promise<void> {
    try {
      const data = await this.resolveSource(source);
      this.text = data;
      this.pages = this.paginateText(data);
      this.currentPage = 1;
      this.pageSizes.clear();
    } catch (error) {
      console.error('[TextEngine] Erro ao carregar:', error);
      throw error;
    }
  }

  getPageCount(): number { return this.pages.length; }
  getCurrentPage(): number { return this.currentPage; }
  goToPage(page: number): void {
    if (page >= 1 && page <= this.getPageCount()) this.currentPage = page;
  }
  setZoom(zoom: number): void { this.zoom = Math.max(0.5, Math.min(3.0, zoom)); }
  getZoom(): number { return this.zoom; }

  rotate(direction: 'clockwise' | 'counterclockwise'): void {
    if (direction === 'clockwise') this.rotation = (this.rotation + 90) % 360;
    else { this.rotation = (this.rotation - 90) % 360; if (this.rotation < 0) this.rotation += 360; }
  }

  getRotation(): number { return this.rotation; }

  async getPageDimensions(pageIndex: number): Promise<{ width: number; height: number }> {
    return this.pageSizes.get(pageIndex) ?? { width: 0, height: 0 };
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
    void scale;
    const element = target as HTMLElement;
    if (!element) return;
    const text = this.pages[pageIndex] ?? '';

    const width = element.clientWidth > 0 ? element.clientWidth : 640;
    const height = element.clientHeight > 0 ? element.clientHeight : 900;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    if (width >= 320 && height >= 480) this.pageSizes.set(pageIndex, { width, height });

    element.innerHTML = '';
    const container = document.createElement('div');
    container.style.padding = '32px';
    container.style.fontSize = `${Math.round(this.zoom * 16)}px`;
    container.style.lineHeight = '1.6';
    container.style.whiteSpace = 'pre-wrap';
    container.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    container.textContent = text;
    element.appendChild(container);
  }

  async renderTextLayer(pageIndex: number, container: any, scale: number): Promise<void> {
    void pageIndex;
    void scale;
    const element = container as HTMLElement;
    if (element) element.innerHTML = '';
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    const text = this.pages[pageIndex] ?? '';
    if (!text) return [];
    return [{
      str: text,
      dir: 'ltr',
      width: 0,
      height: 0,
      transform: [1, 0, 0, 1, 0, 0],
      fontName: 'default',
    }];
  }

  async getOutline(): Promise<OutlineItem[]> {
    return [];
  }

  async getPageIndex(dest: any): Promise<number | null> {
    void dest;
    return null;
  }

  destroy(): void {
    this.text = '';
    this.pages = [];
    this.pageSizes.clear();
  }

  private paginateText(text: string): string[] {
    const chunkSize = 1600;
    const pages: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      pages.push(text.slice(i, i + chunkSize));
    }
    return pages.length > 0 ? pages : [''];
  }

  private async resolveSource(source: DocumentSource): Promise<string> {
    if (typeof source === 'string') {
      if (source.startsWith('http://') || source.startsWith('https://') || source.startsWith('/')) {
        const res = await fetch(source);
        return await res.text();
      }
      return source;
    }
    if (this.isUriSource(source)) {
      const res = await fetch(source.uri);
      return await res.text();
    }
    if (this.isDataSource(source)) {
      return new TextDecoder('utf-8').decode(source.data);
    }
    if (this.isFileLike(source)) {
      const buffer = await source.arrayBuffer();
      return new TextDecoder('utf-8').decode(buffer);
    }
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      return new TextDecoder('utf-8').decode(source);
    }
    return '';
  }

  private isUriSource(source: DocumentSource): source is { uri: string } {
    return typeof source === 'object' && source !== null && 'uri' in source;
  }

  private isDataSource(source: DocumentSource): source is { data: ArrayBuffer | Uint8Array } {
    return typeof source === 'object' && source !== null && 'data' in source;
  }

  private isFileLike(source: DocumentSource): source is FileLike {
    return typeof source === 'object' && source !== null && typeof (source as FileLike).arrayBuffer === 'function';
  }
}
