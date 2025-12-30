import { NativeModules, requireNativeComponent, type ViewProps } from 'react-native';
import { BaseDocumentEngine, papyrusEvents } from '@papyrus-sdk/core';
import {
  DocumentLoadInput,
  DocumentLoadRequest,
  DocumentEngine,
  DocumentSource,
  DocumentType,
  PapyrusEventType,
  RenderTargetType,
  TextItem,
  OutlineItem,
  FileLike,
  SearchResult,
  TextSelection,
} from '@papyrus-sdk/types';

const MODULE_NAME = 'PapyrusNativeEngine';

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  table.fill(255);
  for (let i = 0; i < BASE64_CHARS.length; i += 1) {
    table[BASE64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

const parseDataUri = (value: string): { mime: string; isBase64: boolean; data: string } | null => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(value);
  if (!match) return null;
  return {
    mime: match[1] ?? '',
    isBase64: Boolean(match[2]),
    data: match[3] ?? '',
  };
};

const looksLikeUri = (value: string): boolean =>
  value.startsWith('http://') ||
  value.startsWith('https://') ||
  value.startsWith('/') ||
  value.startsWith('./') ||
  value.startsWith('../') ||
  value.startsWith('file://');

const isLikelyBase64 = (value: string): boolean => {
  if (looksLikeUri(value)) return false;
  if (value.includes('.')) return false;
  if (value.length < 16) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
};

const isHttpUri = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://');

const decodeBase64 = (value: string): Uint8Array => {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outputLength = Math.max(0, (clean.length * 3) / 4 - padding);
  const output = new Uint8Array(outputLength);

  let buffer = 0;
  let bits = 0;
  let index = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const charCode = clean.charCodeAt(i);
    if (charCode === 61) break;
    const valueIndex = BASE64_LOOKUP[charCode];
    if (valueIndex === 255) continue;
    buffer = (buffer << 6) | valueIndex;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[index++] = (buffer >> bits) & 0xff;
    }
  }
  return output;
};

const encodeBase64 = (bytes: Uint8Array): string => {
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < bytes.length; i += 1) {
    buffer = (buffer << 8) | bytes[i];
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      output += BASE64_CHARS[(buffer >> bits) & 0x3f];
    }
  }

  if (bits > 0) {
    output += BASE64_CHARS[(buffer << (6 - bits)) & 0x3f];
  }

  const remainder = bytes.length % 3;
  if (remainder === 1) return `${output}==`;
  if (remainder === 2) return `${output}=`;
  return output;
};

const isLoadRequest = (input: DocumentLoadInput): input is DocumentLoadRequest =>
  typeof input === 'object' && input !== null && 'source' in input && 'type' in input;

const normalizeLoadInput = (input: DocumentLoadInput): { source: DocumentSource; type?: DocumentType } =>
  isLoadRequest(input) ? { source: input.source, type: input.type } : { source: input };

const inferDocumentType = (source: DocumentSource): DocumentType => {
  if (typeof source === 'string') {
    const dataUri = parseDataUri(source);
    if (dataUri?.mime) {
      const mime = dataUri.mime.toLowerCase();
      if (mime.includes('epub')) return 'epub';
      if (mime.includes('text')) return 'text';
      if (mime.includes('pdf')) return 'pdf';
    }

    const clean = source.split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.split('.').pop()?.toLowerCase() : undefined;
    if (ext === 'epub') return 'epub';
    if (ext === 'txt') return 'text';
    if (ext === 'pdf') return 'pdf';
    return 'pdf';
  }

  if (typeof source === 'object' && source !== null && 'uri' in source) {
    const uri = source.uri;
    const clean = uri.split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.split('.').pop()?.toLowerCase() : undefined;
    if (ext === 'epub') return 'epub';
    if (ext === 'txt') return 'text';
    if (ext === 'pdf') return 'pdf';
  }

  return 'pdf';
};

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

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type } = normalizeLoadInput(input);
    if (type && type !== 'pdf') {
      throw new Error(`[NativeDocumentEngine] Tipo de documento não suportado: ${type}`);
    }

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
    if (typeof source === 'string') {
      const dataUri = parseDataUri(source);
      if (dataUri?.isBase64) {
        return { data: decodeBase64(dataUri.data) };
      }
      if (looksLikeUri(source)) return { uri: source };
      if (isLikelyBase64(source)) return { data: decodeBase64(source) };
      return { uri: source };
    }
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

type WebViewBridge = {
  postMessage: (message: string) => void;
};

type WebViewResponseMessage = {
  type: 'response';
  id: string;
  ok: boolean;
  data?: any;
  error?: string;
};

type WebViewEventMessage = {
  type: 'event';
  name: string;
  payload?: any;
};

type WebViewStateMessage = {
  type: 'state';
  payload: {
    pageCount?: number;
    currentPage?: number;
    zoom?: number;
    outline?: OutlineItem[];
  };
};

type WebViewReadyMessage = {
  type: 'ready';
};

type WebViewRuntimeMessage =
  | WebViewResponseMessage
  | WebViewEventMessage
  | WebViewStateMessage
  | WebViewReadyMessage;

type WebViewSourcePayload =
  | { kind: 'uri'; uri: string }
  | { kind: 'base64'; data: string; mime?: string }
  | { kind: 'text'; text: string };

export class WebViewDocumentEngine extends BaseDocumentEngine {
  private bridge: WebViewBridge | null = null;
  private ready = false;
  private requestId = 0;
  private pending = new Map<string, { resolve: (data: any) => void; reject: (error: Error) => void }>();
  private bridgeResolvers: Array<(bridge: WebViewBridge) => void> = [];
  private readyResolvers: Array<() => void> = [];
  private pageCount = 0;
  private currentPage = 1;
  private zoom = 1.0;
  private rotation = 0;
  private outline: OutlineItem[] = [];

  getRenderTargetType(): 'webview' {
    return 'webview';
  }

  attachBridge(bridge: WebViewBridge): void {
    this.bridge = bridge;
    this.bridgeResolvers.forEach((resolve) => resolve(bridge));
    this.bridgeResolvers = [];
  }

  handleMessage(raw: string): void {
    let message: WebViewRuntimeMessage | null = null;
    try {
      message = JSON.parse(raw) as WebViewRuntimeMessage;
    } catch {
      return;
    }

    if (!message) return;

    if (message.type === 'ready') {
      this.ready = true;
      this.readyResolvers.forEach((resolve) => resolve());
      this.readyResolvers = [];
      return;
    }

    if (message.type === 'response') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) {
        pending.resolve(message.data);
      } else {
        pending.reject(new Error(message.error ?? '[Papyrus] WebView runtime error'));
      }
      return;
    }

    if (message.type === 'state') {
      if (typeof message.payload.pageCount === 'number') this.pageCount = message.payload.pageCount;
      if (typeof message.payload.currentPage === 'number') this.currentPage = message.payload.currentPage;
      if (typeof message.payload.zoom === 'number') this.zoom = message.payload.zoom;
      if (Array.isArray(message.payload.outline)) this.outline = message.payload.outline;
      return;
    }

    if (message.type === 'event') {
      const payload = message.payload ?? {};
      if (message.name === 'RUNTIME_LOG') {
        if (__DEV__) {
          const text = typeof payload?.message === 'string' ? payload.message : JSON.stringify(payload);
          console.log('[Papyrus WebView runtime]', text);
        }
        return;
      }
      if (message.name === 'RUNTIME_ERROR') {
        if (__DEV__) {
          console.warn('[Papyrus WebView runtime]', payload);
        }
        return;
      }
      if (message.name === PapyrusEventType.TEXT_SELECTED) {
        papyrusEvents.emit(PapyrusEventType.TEXT_SELECTED, payload);
      } else if (message.name === PapyrusEventType.SEARCH_TRIGGERED) {
        papyrusEvents.emit(PapyrusEventType.SEARCH_TRIGGERED, payload);
      } else if (message.name === PapyrusEventType.DOCUMENT_LOADED) {
        if (typeof payload.pageCount === 'number') {
          this.pageCount = payload.pageCount;
        }
        papyrusEvents.emit(PapyrusEventType.DOCUMENT_LOADED, payload);
      }
      return;
    }

    if (__DEV__) {
      console.warn('[Papyrus WebView] Unknown message', message);
    }
  }

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type } = normalizeLoadInput(input);
    const resolvedType = type ?? inferDocumentType(source);
    if (resolvedType === 'pdf') {
      throw new Error('[WebViewDocumentEngine] Use o NativeDocumentEngine para PDFs no mobile.');
    }

    const payloadSource = await this.normalizeRuntimeSource(resolvedType, source);
    const response = await this.request<{ pageCount?: number; outline?: OutlineItem[] }>('load', {
      type: resolvedType,
      source: payloadSource,
    });

    if (typeof response?.pageCount === 'number') this.pageCount = response.pageCount;
    if (Array.isArray(response?.outline)) this.outline = response.outline;
    this.currentPage = 1;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  goToPage(page: number): void {
    if (page < 1) return;
    this.currentPage = page;
    void this.request('go-to-page', { page });
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.5, Math.min(4.0, zoom));
    void this.request('set-zoom', { zoom: this.zoom });
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
    void this.request('set-rotation', { rotation: this.rotation });
  }

  getRotation(): number {
    return this.rotation;
  }

  async renderPage(pageIndex: number, target: any, scale: number): Promise<void> {
    void pageIndex;
    void target;
    void scale;
  }

  async renderTextLayer(pageIndex: number, container: any, scale: number): Promise<void> {
    void pageIndex;
    void container;
    void scale;
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    return await this.request<TextItem[]>('get-text-content', { pageIndex });
  }

  async getPageDimensions(pageIndex: number): Promise<{ width: number; height: number }> {
    return await this.request<{ width: number; height: number }>('get-page-dimensions', { pageIndex });
  }

  async searchText(query: string): Promise<SearchResult[]> {
    return await this.request<SearchResult[]>('search-text', { query });
  }

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null> {
    return await this.request<TextSelection | null>('select-text', { pageIndex, rect });
  }

  async getOutline(): Promise<OutlineItem[]> {
    if (this.outline.length > 0) return this.outline;
    return await this.request<OutlineItem[]>('get-outline');
  }

  async getPageIndex(dest: any): Promise<number | null> {
    return await this.request<number | null>('get-page-index', { dest });
  }

  destroy(): void {
    this.pending.forEach(({ reject }) => reject(new Error('[Papyrus] WebView engine destroyed')));
    this.pending.clear();
    this.bridge = null;
    this.ready = false;
  }

  private async ensureBridge(): Promise<WebViewBridge> {
    if (this.bridge) return this.bridge;
    return new Promise((resolve) => {
      this.bridgeResolvers.push(resolve);
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) return;
    return new Promise((resolve) => {
      this.readyResolvers.push(resolve);
    });
  }

  private async request<T = any>(kind: string, payload?: any): Promise<T> {
    const bridge = await this.ensureBridge();
    await this.ensureReady();
    const id = `${Date.now()}-${this.requestId++}`;
    return new Promise<T>((resolve, reject) => {
      const timeoutMs = kind === 'load' ? 30000 : 8000;
      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[Papyrus] WebView response timeout: ${kind}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (data) => {
          clearTimeout(timeoutId);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      });
      bridge.postMessage(JSON.stringify({ id, kind, payload }));
    });
  }

  private async normalizeRuntimeSource(type: DocumentType, source: DocumentSource): Promise<WebViewSourcePayload> {
    if (typeof source === 'string') {
      const dataUri = parseDataUri(source);
      if (dataUri) {
        if (dataUri.isBase64) {
          return { kind: 'base64', data: dataUri.data, mime: dataUri.mime || undefined };
        }
        const text = decodeURIComponent(dataUri.data);
        return { kind: 'text', text };
      }

      if (looksLikeUri(source)) {
        if (isHttpUri(source)) {
          const fetched = await this.fetchRemoteSource(type, source);
          if (fetched) return fetched;
        }
        return { kind: 'uri', uri: source };
      }

      if (isLikelyBase64(source)) {
        return { kind: 'base64', data: source };
      }

      if (type === 'text') {
        return { kind: 'text', text: source };
      }

      return { kind: 'uri', uri: source };
    }

    if (this.isUriSource(source)) {
      const uri = source.uri;
      if (isHttpUri(uri)) {
        const fetched = await this.fetchRemoteSource(type, uri);
        if (fetched) return fetched;
      }
      return { kind: 'uri', uri };
    }
    if (this.isDataSource(source)) {
      const bytes = source.data instanceof Uint8Array ? source.data : new Uint8Array(source.data);
      return { kind: 'base64', data: encodeBase64(bytes) };
    }
    if (this.isFileLike(source)) {
      const buffer = await source.arrayBuffer();
      return { kind: 'base64', data: encodeBase64(new Uint8Array(buffer)) };
    }
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
      return { kind: 'base64', data: encodeBase64(bytes) };
    }

    return { kind: 'base64', data: encodeBase64(new Uint8Array(source as ArrayBuffer)) };
  }

  private async fetchRemoteSource(type: DocumentType, uri: string): Promise<WebViewSourcePayload | null> {
    try {
      const response = await fetch(uri);
      if (!response.ok) return null;
      if (type === 'text') {
        const text = await response.text();
        return { kind: 'text', text };
      }
      if (type === 'epub') {
        const buffer = await this.readResponseBuffer(response);
        return { kind: 'base64', data: encodeBase64(new Uint8Array(buffer)) };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async readResponseBuffer(response: Response): Promise<ArrayBuffer> {
    try {
      return await response.arrayBuffer();
    } catch {
      const blob = await response.blob();
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('[Papyrus] Failed to read response blob'));
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
    }
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

export class MobileDocumentEngine extends BaseDocumentEngine {
  private pdfEngine: NativeDocumentEngine;
  private webEngine: WebViewDocumentEngine;
  private activeEngine: DocumentEngine;

  constructor() {
    super();
    this.pdfEngine = new NativeDocumentEngine();
    this.webEngine = new WebViewDocumentEngine();
    this.activeEngine = this.pdfEngine;
  }

  getRenderTargetType(): RenderTargetType {
    return this.activeEngine.getRenderTargetType?.() ?? 'canvas';
  }

  attachWebView(bridge: WebViewBridge): void {
    this.webEngine.attachBridge(bridge);
  }

  handleWebViewMessage(data: string): void {
    this.webEngine.handleMessage(data);
  }

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type } = normalizeLoadInput(input);
    const resolvedType = type ?? inferDocumentType(source);
    this.activeEngine = resolvedType === 'pdf' ? this.pdfEngine : this.webEngine;
    await this.activeEngine.load({ type: resolvedType, source });
  }

  getPageCount(): number {
    return this.activeEngine.getPageCount();
  }

  getCurrentPage(): number {
    return this.activeEngine.getCurrentPage();
  }

  goToPage(page: number): void {
    this.activeEngine.goToPage(page);
  }

  setZoom(zoom: number): void {
    this.activeEngine.setZoom(zoom);
  }

  getZoom(): number {
    return this.activeEngine.getZoom();
  }

  rotate(direction: 'clockwise' | 'counterclockwise'): void {
    this.activeEngine.rotate(direction);
  }

  getRotation(): number {
    return this.activeEngine.getRotation();
  }

  async renderPage(pageIndex: number, target: any, scale: number): Promise<void> {
    await this.activeEngine.renderPage(pageIndex, target, scale);
  }

  async renderTextLayer(pageIndex: number, container: any, scale: number): Promise<void> {
    await this.activeEngine.renderTextLayer(pageIndex, container, scale);
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    return await this.activeEngine.getTextContent(pageIndex);
  }

  async getPageDimensions(pageIndex: number): Promise<{ width: number; height: number }> {
    return await this.activeEngine.getPageDimensions(pageIndex);
  }

  async searchText(query: string): Promise<SearchResult[]> {
    if (typeof this.activeEngine.searchText === 'function') {
      return await this.activeEngine.searchText(query);
    }
    return [];
  }

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null> {
    if (typeof this.activeEngine.selectText === 'function') {
      return await this.activeEngine.selectText(pageIndex, rect);
    }
    return null;
  }

  async getOutline(): Promise<OutlineItem[]> {
    return await this.activeEngine.getOutline();
  }

  async getPageIndex(dest: any): Promise<number | null> {
    return await this.activeEngine.getPageIndex(dest);
  }

  destroy(): void {
    this.pdfEngine.destroy();
    this.webEngine.destroy();
  }
}
