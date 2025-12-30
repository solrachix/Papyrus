import { BaseDocumentEngine } from '@papyrus-sdk/core';
import { DocumentLoadInput, DocumentLoadRequest, DocumentSource, DocumentType, TextItem, OutlineItem, FileLike, TextSelection } from '@papyrus-sdk/types';

export class TextEngine extends BaseDocumentEngine {
  private text = '';
  private pages: string[] = [];
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;
  private pageSizes = new Map<number, { width: number; height: number }>();

  getRenderTargetType(): 'element' { return 'element'; }

  async load(input: DocumentLoadInput): Promise<void> {
    try {
      const { source, type } = this.normalizeLoadInput(input);
      if (type && type !== 'text') {
        throw new Error(`[TextEngine] Tipo de documento não suportado: ${type}`);
      }

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
      const dataUri = this.parseDataUri(source);
      if (dataUri) {
        if (dataUri.isBase64) {
          return this.decodeBase64ToText(dataUri.data);
        }
        return decodeURIComponent(dataUri.data);
      }
      if (this.looksLikeUri(source)) {
        const res = await fetch(source);
        return await res.text();
      }
      if (this.isLikelyBase64(source)) {
        return this.decodeBase64ToText(source);
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

  private normalizeLoadInput(input: DocumentLoadInput): { source: DocumentSource; type?: DocumentType } {
    if (this.isLoadRequest(input)) {
      return { source: input.source, type: input.type };
    }
    return { source: input };
  }

  private isLoadRequest(input: DocumentLoadInput): input is DocumentLoadRequest {
    return typeof input === 'object' && input !== null && 'source' in input && 'type' in input;
  }

  private parseDataUri(value: string): { isBase64: boolean; data: string } | null {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(value);
    if (!match) return null;
    const isBase64 = Boolean(match[2]);
    const data = match[3] ?? '';
    return { isBase64, data };
  }

  private decodeBase64ToText(value: string): string {
    const clean = value.replace(/\s/g, '');
    if (typeof atob !== 'function') {
      throw new Error('[TextEngine] atob não está disponível para decodificar base64.');
    }
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
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
