import { NativeModules, requireNativeComponent, type ViewProps } from 'react-native';
import { BaseDocumentEngine } from '@papyrus-sdk/core';
import { DocumentSource, TextItem, OutlineItem, FileLike, SearchResult, TextSelection } from '@papyrus-sdk/types';

const MODULE_NAME = 'PapyrusNativeEngine';

type NativeDocumentSource = {
  uri?: string;
  data?: ArrayBuffer | Uint8Array;
};

type NativeEngineModule = {
  createEngine?: () => string;
  destroyEngine?: (engineId: string) => void;
  load?: (engineId: string, source: NativeDocumentSource) => Promise<{ pageCount?: number } | void>;
  getPageCount?: (engineId: string) => number;
  renderPage?: (engineId: string, pageIndex: number, target: number, scale: number, zoom: number, rotation: number) => void;
  renderTextLayer?: (engineId: string, pageIndex: number, target: number, scale: number, zoom: number, rotation: number) => void;
  getTextContent?: (engineId: string, pageIndex: number) => Promise<TextItem[]>;
  getPageDimensions?: (engineId: string, pageIndex: number) => Promise<{ width: number; height: number }>;
  searchText?: (engineId: string, query: string) => Promise<SearchResult[]>;
  selectText?: (engineId: string, pageIndex: number, x: number, y: number, width: number, height: number) => Promise<TextSelection | null>;
  getOutline?: (engineId: string) => Promise<OutlineItem[]>;
  getPageIndex?: (engineId: string, dest: any) => Promise<number | null>;
};

export type PapyrusPageViewProps = ViewProps & {
  engineId?: string;
};

export const PapyrusPageView = requireNativeComponent<PapyrusPageViewProps>('PapyrusPageView');

export class NativeDocumentEngine extends BaseDocumentEngine {
  private nativeModule: NativeEngineModule | null = null;
  private engineId: string = 'default';
  private pageCount: number = 0;
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;

  constructor() {
    super();
    this.nativeModule = (NativeModules as any)[MODULE_NAME] ?? null;
    this.engineId = this.nativeModule?.createEngine ? this.nativeModule.createEngine() : 'default';
  }

  async load(source: DocumentSource): Promise<void> {
    const native = this.assertNativeModule();
    const normalized = await this.normalizeSource(source);
    const result = native.load ? await native.load(this.engineId, normalized) : undefined;

    if (result && typeof result.pageCount === 'number') {
      this.pageCount = result.pageCount;
    } else if (native.getPageCount) {
      this.pageCount = native.getPageCount(this.engineId);
    } else {
      this.pageCount = 0;
    }

    this.currentPage = 1;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.pageCount) {
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

  async renderPage(pageIndex: number, target: any, scale: number): Promise<void> {
    const native = this.assertNativeModule();
    if (!native.renderPage) return;
    const viewTag = this.toNativeViewTag(target);
    if (viewTag === null) return;
    native.renderPage(this.engineId, pageIndex, viewTag, scale, this.zoom, this.rotation);
  }

  async renderTextLayer(pageIndex: number, target: any, scale: number): Promise<void> {
    const native = this.assertNativeModule();
    if (!native.renderTextLayer) return;
    const viewTag = this.toNativeViewTag(target);
    if (viewTag === null) return;
    native.renderTextLayer(this.engineId, pageIndex, viewTag, scale, this.zoom, this.rotation);
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    const native = this.assertNativeModule();
    if (!native.getTextContent) return [];
    return native.getTextContent(this.engineId, pageIndex);
  }

  async getPageDimensions(pageIndex: number): Promise<{ width: number; height: number }> {
    const native = this.assertNativeModule();
    if (!native.getPageDimensions) return { width: 0, height: 0 };
    return native.getPageDimensions(this.engineId, pageIndex);
  }

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null> {
    const native = this.assertNativeModule();
    if (!native.selectText) return null;
    return native.selectText(this.engineId, pageIndex, rect.x, rect.y, rect.width, rect.height);
  }

  async getOutline(): Promise<OutlineItem[]> {
    const native = this.assertNativeModule();
    if (!native.getOutline) return [];
    return native.getOutline(this.engineId);
  }

  async searchText(query: string): Promise<SearchResult[]> {
    const native = this.assertNativeModule();
    if (!native.searchText) return [];
    return native.searchText(this.engineId, query);
  }

  async getPageIndex(dest: any): Promise<number | null> {
    const native = this.assertNativeModule();
    if (!native.getPageIndex) return null;
    return native.getPageIndex(this.engineId, dest);
  }

  destroy(): void {
    this.nativeModule?.destroyEngine?.(this.engineId);
  }

  private assertNativeModule(): NativeEngineModule {
    if (!this.nativeModule) {
      throw new Error(`[Papyrus] Native module "${MODULE_NAME}" not found. Did you run pod install / gradle sync?`);
    }
    return this.nativeModule;
  }

  private async normalizeSource(source: DocumentSource): Promise<NativeDocumentSource> {
    if (typeof source === 'string') return { uri: source };
    if (this.isUriSource(source)) return { uri: source.uri };
    if (this.isDataSource(source)) return { data: source.data };
    if (this.isFileLike(source)) return { data: await source.arrayBuffer() };
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) return { data: source };
    return { data: source as ArrayBuffer };
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

  private toNativeViewTag(target: any): number | null {
    if (typeof target === 'number') return target;
    if (target?.nativeTag && typeof target.nativeTag === 'number') return target.nativeTag;
    return null;
  }
}
