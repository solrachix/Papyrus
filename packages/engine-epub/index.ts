import ePub from 'epubjs';
import { BaseDocumentEngine } from '@papyrus-sdk/core';
import { DocumentSource, TextItem, OutlineItem, FileLike, TextSelection } from '@papyrus-sdk/types';

export class EPUBEngine extends BaseDocumentEngine {
  private book: any = null;
  private spineItems: any[] = [];
  private renditions = new Map<string, any>();
  private renditionTargets = new Map<string, HTMLElement>();
  private pageSizes = new Map<number, { width: number; height: number }>();
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;

  getRenderTargetType(): 'element' { return 'element'; }

  async load(source: DocumentSource): Promise<void> {
    try {
      let data: any;
      if (typeof source === 'string') {
        data = source;
      } else if (this.isUriSource(source)) {
        data = source.uri;
      } else if (this.isDataSource(source)) {
        data = source.data;
      } else if (this.isFileLike(source)) {
        data = await source.arrayBuffer();
      } else {
        data = source;
      }

      this.book = ePub(data);
      await this.book.ready;
      this.spineItems = this.book.spine?.items ?? [];
      this.currentPage = 1;
      this.renditions.forEach((rendition) => rendition?.destroy?.());
      this.renditions.clear();
      this.renditionTargets.clear();
      this.pageSizes.clear();
    } catch (error) {
      console.error('[EPUBEngine] Erro ao carregar:', error);
      throw error;
    }
  }

  getPageCount(): number { return this.spineItems.length; }
  getCurrentPage(): number { return this.currentPage; }
  goToPage(page: number): void {
    if (page >= 1 && page <= this.getPageCount()) this.currentPage = page;
  }
  setZoom(zoom: number): void {
    this.zoom = Math.max(0.5, Math.min(3.0, zoom));
    this.renditions.forEach((rendition) => this.applyRenditionTheme(rendition));
  }
  getZoom(): number { return this.zoom; }

  rotate(direction: 'clockwise' | 'counterclockwise'): void {
    if (direction === 'clockwise') this.rotation = (this.rotation + 90) % 360;
    else { this.rotation = (this.rotation - 90) % 360; if (this.rotation < 0) this.rotation += 360; }
  }

  getRotation(): number { return this.rotation; }

  async getPageDimensions(pageIndex: number): Promise<{ width: number; height: number }> {
    const size = this.pageSizes.get(pageIndex);
    if (size) return size;
    return { width: 0, height: 0 };
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
    const scaleKey = Math.round(scale * 1000);
    const element = target as HTMLElement;
    if (!this.book || !element) return;

    const spineItem = this.spineItems[pageIndex];
    if (!spineItem) return;

    const width = element.clientWidth > 0 ? element.clientWidth : 640;
    const height = element.clientHeight > 0 ? element.clientHeight : 900;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    if (width >= 320 && height >= 480) this.pageSizes.set(pageIndex, { width, height });

    const renditionKey = `${pageIndex}:${scaleKey}`;
    let rendition = this.renditions.get(renditionKey);
    const currentTarget = this.renditionTargets.get(renditionKey);
    if (!rendition || currentTarget !== element) {
      if (rendition?.destroy) rendition.destroy();
      element.innerHTML = '';
      rendition = this.book.renderTo(element, {
        width,
        height,
        flow: 'paginated',
        spread: 'none',
      });
      this.renditions.set(renditionKey, rendition);
      this.renditionTargets.set(renditionKey, element);
      if (rendition?.hooks?.content?.register) {
        rendition.hooks.content.register((contents: any) => {
          const frame = contents?.document?.defaultView?.frameElement as HTMLIFrameElement | null;
          if (frame) {
            frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
          }
        });
      }
    } else if (typeof rendition.resize === 'function') {
      rendition.resize(width, height);
    }

    if (rendition) {
      this.applyRenditionTheme(rendition);
      const targetRef = spineItem.href || spineItem.idref || spineItem.cfiBase || pageIndex;
      await rendition.display(targetRef);
    }
  }

  async renderTextLayer(pageIndex: number, container: any, scale: number): Promise<void> {
    void pageIndex;
    void scale;
    const element = container as HTMLElement;
    if (element) element.innerHTML = '';
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    if (!this.book) return [];
    const spineItem = this.spineItems[pageIndex];
    if (!spineItem) return [];

    try {
      const section = this.book.spine.get(spineItem.idref || spineItem.href);
      const text = typeof section?.text === 'function' ? await section.text() : '';
      if (!text) return [];
      return [{
        str: text,
        dir: 'ltr',
        width: 0,
        height: 0,
        transform: [1, 0, 0, 1, 0, 0],
        fontName: 'default',
      }];
    } catch {
      return [];
    }
  }

  async getOutline(): Promise<OutlineItem[]> {
    if (!this.book) return [];
    const nav = await this.book.loaded?.navigation;
    const toc = nav?.toc ?? [];
    if (!toc.length) return [];

    const mapItem = (item: any): OutlineItem => {
      const title = item.label || item.title || '';
      const pageIndex = this.getSpineIndexByHref(item.href || '');
      const children = Array.isArray(item.subitems) ? item.subitems.map(mapItem) : [];
      const outlineItem: OutlineItem = { title, pageIndex };
      if (children.length > 0) outlineItem.children = children;
      return outlineItem;
    };

    return toc.map(mapItem);
  }

  async getPageIndex(dest: any): Promise<number | null> {
    if (!dest) return null;
    if (typeof dest === 'string') return this.getSpineIndexByHref(dest);
    return null;
  }

  destroy(): void {
    this.renditions.forEach((rendition) => rendition?.destroy?.());
    this.renditions.clear();
    this.renditionTargets.clear();
    this.pageSizes.clear();
    if (this.book?.destroy) this.book.destroy();
    this.book = null;
    this.spineItems = [];
  }

  private applyRenditionTheme(rendition: any): void {
    if (!rendition) return;
    const fontSize = `${Math.round(this.zoom * 100)}%`;
    if (rendition.themes?.fontSize) {
      rendition.themes.fontSize(fontSize);
    } else if (rendition.themes?.override) {
      rendition.themes.override('font-size', fontSize);
    }
  }

  private getSpineIndexByHref(href: string): number {
    const normalized = this.normalizeHref(href);
    if (!normalized) return -1;
    const index = this.spineItems.findIndex((item) => this.normalizeHref(item.href) === normalized);
    return index;
  }

  private normalizeHref(href: string): string {
    return href.split('#')[0];
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
