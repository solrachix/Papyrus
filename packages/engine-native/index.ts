import type { ComponentType, RefAttributes } from "react";
import {
  NativeModules,
  Platform,
  UIManager,
  TurboModuleRegistry,
  requireNativeComponent,
  View,
  type ViewProps,
} from "react-native";
import { BaseDocumentEngine, papyrusEvents } from "@papyrus-sdk/core";
import {
  DocumentLoadInput,
  DocumentLoadRequest,
  DocumentEngine,
  DocumentSource,
  DocumentType,
  ComicFormat,
  ComicFitMode,
  ComicLayoutMode,
  ComicReadingDirection,
  PageDestination,
  PapyrusEventType,
  RenderTargetType,
  TextItem,
  OutlineItem,
  FileLike,
  SearchResult,
  TextSearchResult,
  TextRangeSelection,
  TextSelection,
  TextSelectionEndpoints,
  RenderPageResult,
  RenderPageTelemetryContext,
  PageTheme,
  Annotation,
  AnnotationAnchor,
  InkStrokeCommit,
  PdfVisiblePage,
} from "@papyrus-sdk/types";
import { inferDocumentType, resolveComicFormat } from "./documentType";
import { resolvePapyrusNativeModule } from "./nativeModuleResolution";
import { isNativeViewManagerRegistered } from "./nativeViewAvailability";
import { clampTextOffset } from "./nativeTextModel";
import { resolveNativeMobileDocumentRoute } from "./nativeDocumentRoute";

const MODULE_NAME = "PapyrusNativeEngine";

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  table.fill(255);
  for (let i = 0; i < BASE64_CHARS.length; i += 1) {
    table[BASE64_CHARS.charCodeAt(i)] = i;
  }
  return table;
})();

const parseDataUri = (
  value: string
): { mime: string; isBase64: boolean; data: string } | null => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(value);
  if (!match) return null;
  return {
    mime: match[1] ?? "",
    isBase64: Boolean(match[2]),
    data: match[3] ?? "",
  };
};

const looksLikeUri = (value: string): boolean =>
  value.startsWith("http://") ||
  value.startsWith("https://") ||
  value.startsWith("/") ||
  value.startsWith("./") ||
  value.startsWith("../") ||
  value.startsWith("file://") ||
  value.startsWith("content://") ||
  value.startsWith("android.resource://");

const isLikelyBase64 = (value: string): boolean => {
  if (looksLikeUri(value)) return false;
  if (value.includes(".")) return false;
  if (value.length < 16) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
};

const isHttpUri = (value: string): boolean =>
  value.startsWith("http://") || value.startsWith("https://");

// Metro serves bundled React Native assets over the development server. Keep
// those URIs intact so the WebView can stream them directly instead of
// downloading the whole EPUB/CBR through the RN bridge first.
const isMetroAssetUri = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname.startsWith("/assets/") &&
      url.searchParams.has("platform") &&
      url.searchParams.has("hash")
    );
  } catch {
    return false;
  }
};

const isLocalUri = (value: string): boolean =>
  value.startsWith("content://") ||
  value.startsWith("file://") ||
  value.startsWith("android.resource://");

const decodeBase64 = (value: string): Uint8Array => {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
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
  let output = "";
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

const isLoadRequest = (
  input: DocumentLoadInput
): input is DocumentLoadRequest =>
  typeof input === "object" &&
  input !== null &&
  "source" in input &&
  "type" in input;

const normalizeLoadInput = (
  input: DocumentLoadInput
): { source: DocumentSource; type?: DocumentType; format?: ComicFormat } =>
  isLoadRequest(input)
    ? { source: input.source, type: input.type, format: input.format }
  : { source: input };

const normalizeNativeSource = async (
  source: DocumentSource,
  allowPlainText: boolean
): Promise<NativeDocumentSource> => {
  if (typeof source === "string") {
    const dataUri = parseDataUri(source);
    if (dataUri?.isBase64) return { data: decodeBase64(dataUri.data) };
    if (dataUri && allowPlainText) {
      return { text: decodeURIComponent(dataUri.data) };
    }
    if (looksLikeUri(source)) return { uri: source };
    if (!allowPlainText && isLikelyBase64(source)) return { data: decodeBase64(source) };
    return allowPlainText ? { text: source } : { uri: source };
  }
  if (typeof source === "object" && source !== null && "uri" in source) {
    return { uri: source.uri };
  }
  if (typeof source === "object" && source !== null && "data" in source) {
    const data =
      source.data instanceof Uint8Array
        ? source.data
        : new Uint8Array(source.data);
    return { data };
  }
  if (
    typeof source === "object" &&
    source !== null &&
    typeof (source as FileLike).arrayBuffer === "function"
  ) {
    return { data: new Uint8Array(await (source as FileLike).arrayBuffer()) };
  }
  if (source instanceof ArrayBuffer) return { data: new Uint8Array(source) };
  if (source instanceof Uint8Array) return { data: source };
  throw new Error("[Papyrus] Unsupported native document source");
};

type NativeDocumentSource = {
  uri?: string;
  data?: Uint8Array;
  text?: string;
};

type NativePageDestination = {
  kind: "pageIndex" | "pageNumber" | "named";
  value: number | string;
};

const normalizeNativeDestination = (
  dest: PageDestination
): NativePageDestination | null => {
  if (!dest) return null;
  if (typeof dest === "string") {
    return { kind: "named", value: dest };
  }

  if (
    dest.kind === "pageIndex" ||
    dest.kind === "pageNumber" ||
    dest.kind === "named"
  ) {
    return { kind: dest.kind, value: dest.value };
  }

  return null;
};

type NativeEngineModule = {
  createEngine?: () => string;
  isTablet?: () => boolean;
  destroyEngine?: (engineId: string) => void;
  load?: (
    engineId: string,
    source: NativeDocumentSource
  ) => Promise<{ pageCount?: number } | void>;
  getPageCount?: (engineId: string) => number;
  getLifecycleStats?: () => Record<string, number>;
  renderPage?: (
    engineId: string,
    pageIndex: number,
    target: number,
    scale: number,
    zoom: number,
    rotation: number,
    requestId: string,
    telemetry?: RenderPageTelemetryContext
  ) => Promise<RenderPageResult>;
  renderTextLayer?: (
    engineId: string,
    pageIndex: number,
    target: number,
    scale: number,
    zoom: number,
    rotation: number
  ) => void;
  getTextContent?: (engineId: string, pageIndex: number) => Promise<TextItem[]>;
  getPageDimensions?: (
    engineId: string,
    pageIndex: number
  ) => Promise<{ width: number; height: number }>;
  searchText?: (engineId: string, query: string) => Promise<SearchResult[]>;
  selectText?: (
    engineId: string,
    pageIndex: number,
    x: number,
    y: number,
    width: number,
    height: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ) => Promise<TextSelection | null>;
  getOutline?: (engineId: string) => Promise<OutlineItem[]>;
  getPageIndex?: (
    engineId: string,
    dest: NativePageDestination
  ) => Promise<number | null>;
  readFileChunk?: (
    uri: string,
    offset: number,
    length: number
  ) => Promise<{ data: string; done: boolean }>;
  loadText?: (
    engineId: string,
    generation: number,
    source: NativeDocumentSource
  ) => Promise<{ textLength: number }>;
  closeText?: (engineId: string, generation: number) => void;
  resolveTextAnnotationRange?: (engineId:string,generation:number,anchor:AnnotationAnchor) => Promise<{start:number;end:number}|null>;
  getTextRange?: (
    engineId: string,
    generation: number,
    start: number,
    end: number
  ) => Promise<string>;
  searchTextRanges?: (
    engineId: string,
    generation: number,
    query: string
  ) => Promise<TextSearchResult[]>;
  loadComic?: (
    engineId: string,
    generation: number,
    source: NativeDocumentSource,
    format: ComicFormat
  ) => Promise<{ pageCount: number }>;
  closeComic?: (engineId: string, generation: number) => void;
  getComicPagePreview?: (
    engineId: string,
    generation: number,
    pageIndex: number,
    maxEdge: number
  ) => Promise<string | null>;
};

export type PapyrusPageViewProps = ViewProps & {
  engineId?: string;
  pageTheme?: PageTheme;
};

export type PapyrusPdfViewerViewProps = ViewProps & {
  annotationLabels?: Record<string,string>;
  defineEnabled?: boolean;
  copyLabel?: string;
  selectAllLabel?: string;
  onAnnotateSelection?: (event: {nativeEvent: {text:string;pageIndex:number;rects:{x:number;y:number;width:number;height:number}[];style:"highlight"|"underline"|"strikeout"|"comment"}}) => void;
  engineId?: string;
  pageTheme?: PageTheme;
  zoom?: number;
  currentPage?: number;
  activeTool?: string;
  activeDrawToolPreset?: "ink" | "highlight" | "underline";
  inkStrokeWidth?: number;
  annotationColor?: string;
  annotationSelectionColor?: string;
  annotationOpacity?: number;
  searchResults?: SearchResult[];
  activeSearchIndex?: number;
  annotations?: Annotation[];
  annotationNavigationRequest?: {pageIndex:number;rect:{x:number;y:number;width:number;height:number};nonce:number} | null;
  selectedAnnotationId?: string | null;
  onPageChanged?: (event: { nativeEvent: { page: number } }) => void;
  onZoomChanged?: (event: { nativeEvent: { zoom: number } }) => void;
  onPageChange?: (event: { nativeEvent: { page: number } }) => void;
  onZoomChange?: (event: { nativeEvent: { zoom: number } }) => void;
  onVisiblePagesChange?: (event: { nativeEvent: { pages: PdfVisiblePage[] } }) => void;
  onAnnotationCreated?: (event: { nativeEvent: Annotation }) => void;
  onTap?: (event: { nativeEvent: { pageIndex: number; x: number; y: number } }) => void;
  onAnnotationTap?: (event: { nativeEvent: { id: string; pageIndex: number; type: string; color: string } }) => void;
  onAnnotationDelete?: (event: { nativeEvent: { id: string } }) => void;
  onAnnotationDeselected?: (event: { nativeEvent: Record<string, never> }) => void;
  onInkDrawingCommitted?: (event: {
    nativeEvent: { pageIndex: number; strokes: InkStrokeCommit[] };
  }) => void;
  onInkToolPickerVisibilityChange?: (event: {
    nativeEvent: { visible: boolean };
  }) => void;
  onTextSelected?: (event: { nativeEvent: { text: string; pageIndex: number; rects: { x: number; y: number; width: number; height: number }[] } }) => void;
  onDefineSelection?: (event: { nativeEvent: { text: string; pageIndex: number } }) => void;
  onScroll?: (event: { nativeEvent: { offsetY: number } }) => void;
  selectionActive?: boolean;
  defineLabel?: string;
  defineSelectionMode?: "selection" | "single-word";
  annotateLabel?: string;
  annotationHighlightLabel?: string;
  annotationUnderlineLabel?: string;
  annotationStrikeoutLabel?: string;
  annotationSquigglyLabel?: string;
  annotationNoteLabel?: string;
  annotationDeleteLabel?: string;
  viewMode?: "continuous" | "single";
};

export type PapyrusTextDocumentViewProps = ViewProps & {
  annotations?: Annotation[];
  annotationLabels?: Record<string, string>;
  onAnnotateSelection?: (event: {nativeEvent: TextRangeSelection & {style: "highlight" | "underline" | "strikeout" | "comment"; prefix?: string; suffix?: string}}) => void;
  onAnnotationTap?: (event: {nativeEvent: {id: string}}) => void;
  engineId?: string;
  documentGeneration?: number;
  textLength?: number;
  currentTextOffset?: number;
  scrollToTextOffsetSignal?: number | null;
  textNavigationRequest?: {offset:number;nonce:number} | null;
  searchResults?: TextSearchResult[];
  activeSearchIndex?: number;
  pageTheme?: PageTheme;
  uiTheme?: "light" | "dark";
  fontSize?: number;
  lineHeight?: number;
  pageMargin?: number;
  defineLabel?: string;
  defineSelectionMode?: "selection" | "single-word";
  onTextOffsetChange?: (event: { nativeEvent: { offset: number } }) => void;
  onTextRangeSelected?: (event: {
    nativeEvent: { text: string; start: number; end: number };
  }) => void;
  onDefineSelection?: (event: {
    nativeEvent: { text: string; start: number; end: number };
  }) => void;
};

export type PapyrusComicDocumentViewProps = ViewProps & {
  engineId?: string;
  documentGeneration?: number;
  pageCount?: number;
  currentPage?: number;
  layoutMode?: ComicLayoutMode;
  fitMode?: ComicFitMode;
  readingDirection?: ComicReadingDirection;
  zoom?: number;
  pageTheme?: PageTheme;
  onPageChanged?: (event: { nativeEvent: { page: number } }) => void;
  onZoomChanged?: (event: { nativeEvent: { zoom: number } }) => void;
  onError?: (event: { nativeEvent: { message: string } }) => void;
};

type PapyrusPageViewComponent = ComponentType<
  PapyrusPageViewProps & RefAttributes<View>
>;

type PapyrusPdfViewerViewComponent = ComponentType<
  PapyrusPdfViewerViewProps & RefAttributes<View>
>;

const resolveNativeModule = (): NativeEngineModule | null => {
  return resolvePapyrusNativeModule<NativeEngineModule>({
    nativeModules: NativeModules as Record<string, unknown>,
    turboModuleRegistry: TurboModuleRegistry,
  });
};

let cachedAndroidTabletFormFactor: boolean | undefined;

export const isPapyrusTablet = (): boolean => {
  if (Platform.OS === "ios") return Platform.isPad;
  if (Platform.OS !== "android") return false;
  if (cachedAndroidTabletFormFactor !== undefined) {
    return cachedAndroidTabletFormFactor;
  }

  try {
    cachedAndroidTabletFormFactor = resolveNativeModule()?.isTablet?.() === true;
  } catch {
    cachedAndroidTabletFormFactor = false;
  }

  return cachedAndroidTabletFormFactor;
};

const resolvePapyrusPageView = (): PapyrusPageViewComponent => {
  try {
    return requireNativeComponent<PapyrusPageViewProps>(
      "PapyrusPageView"
    ) as unknown as PapyrusPageViewComponent;
  } catch {
    return View as unknown as PapyrusPageViewComponent;
  }
};

const PAPYRUS_PDF_DOCUMENT_VIEW_NAME = "PapyrusPdfDocumentView";

const hasPapyrusPdfDocumentViewManager = (): boolean =>
  Platform.OS === "ios" &&
  isNativeViewManagerRegistered(UIManager, PAPYRUS_PDF_DOCUMENT_VIEW_NAME);

const unavailablePapyrusPdfDocumentView: PapyrusPdfViewerViewComponent = () =>
  null;

const resolvePapyrusPdfDocumentView = (): PapyrusPdfViewerViewComponent | null => {
  if (!hasPapyrusPdfDocumentViewManager()) return null;
  try {
    return requireNativeComponent<PapyrusPdfViewerViewProps>(
      PAPYRUS_PDF_DOCUMENT_VIEW_NAME
    ) as unknown as PapyrusPdfViewerViewComponent;
  } catch {
    return null;
  }
};

const resolvePapyrusAndroidPdfViewerView = (): PapyrusPdfViewerViewComponent => {
  try {
    return requireNativeComponent<PapyrusPdfViewerViewProps>(
      "PapyrusPdfViewerView"
    ) as unknown as PapyrusPdfViewerViewComponent;
  } catch {
    return View as unknown as PapyrusPdfViewerViewComponent;
  }
};

const papyrusPdfDocumentView = resolvePapyrusPdfDocumentView();

export const isPapyrusPdfDocumentViewAvailable = (): boolean =>
  papyrusPdfDocumentView !== null && hasPapyrusPdfDocumentViewManager();

export const PapyrusPageView = resolvePapyrusPageView();
export const PapyrusPdfViewerView =
  Platform.OS === "ios"
    ? papyrusPdfDocumentView ?? unavailablePapyrusPdfDocumentView
    : resolvePapyrusAndroidPdfViewerView();
export const PapyrusPdfDocumentView = PapyrusPdfViewerView;

const PAPYRUS_TEXT_DOCUMENT_VIEW_NAME = "PapyrusTextDocumentView";
const PAPYRUS_COMIC_DOCUMENT_VIEW_NAME = "PapyrusComicDocumentView";

const resolveNativeView = <Props extends ViewProps>(
  name: string
): ComponentType<Props & RefAttributes<unknown>> | null => {
  if (!isNativeViewManagerRegistered(UIManager, name)) return null;
  try {
    return requireNativeComponent<Props>(name) as unknown as ComponentType<
      Props & RefAttributes<unknown>
    >;
  } catch {
    return null;
  }
};

const papyrusTextDocumentView =
  resolveNativeView<PapyrusTextDocumentViewProps>(
    PAPYRUS_TEXT_DOCUMENT_VIEW_NAME
  );
const papyrusComicDocumentView =
  resolveNativeView<PapyrusComicDocumentViewProps>(
    PAPYRUS_COMIC_DOCUMENT_VIEW_NAME
  );

export const isPapyrusTextDocumentViewAvailable = (): boolean =>
  papyrusTextDocumentView !== null;
export const isPapyrusComicDocumentViewAvailable = (): boolean =>
  papyrusComicDocumentView !== null;
export const PapyrusTextDocumentView =
  papyrusTextDocumentView ?? unavailablePapyrusPdfDocumentView;
export const PapyrusComicDocumentView =
  papyrusComicDocumentView ?? unavailablePapyrusPdfDocumentView;

export class NativeDocumentEngine extends BaseDocumentEngine {
  private nativeModule: NativeEngineModule | null = null;
  private engineId: string = "default";
  private pageCount: number = 0;
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;
  private renderRequestCounter: number = 0;

  constructor() {
    super();
    this.nativeModule = resolveNativeModule();
    this.engineId = this.nativeModule?.createEngine
      ? this.nativeModule.createEngine()
      : "default";
  }

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type } = normalizeLoadInput(input);
    if (type && type !== "pdf") {
      throw new Error(
        `[NativeDocumentEngine] Tipo de documento não suportado: ${type}`
      );
    }

    const native = this.assertNativeModule();
    const normalized = await this.normalizeSource(source);
    let result;
    try {
      result = native.load
        ? await native.load(this.engineId, normalized)
        : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        !/engine not found|papyrus_no_engine/i.test(message) ||
        !native.createEngine
      ) {
        throw error;
      }

      // Fast Refresh can preserve this JS instance after the native store was
      // recreated. Recover the stale id once instead of surfacing a redbox.
      this.engineId = native.createEngine();
      result = native.load
        ? await native.load(this.engineId, normalized)
        : undefined;
    }

    if (result && typeof result.pageCount === "number") {
      this.pageCount = result.pageCount;
    } else if (native.getPageCount) {
      this.pageCount = native.getPageCount(this.engineId);
    } else {
      this.pageCount = 0;
    }

    this.currentPage = 1;
    this.zoom = 1.0;
    this.rotation = 0;
  }

  getPageCount(): number {
    return this.pageCount;
  }

  getLifecycleStats(): Record<string, number> {
    return this.nativeModule?.getLifecycleStats?.() ?? {};
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

  rotate(direction: "clockwise" | "counterclockwise"): void {
    if (direction === "clockwise") {
      this.rotation = (this.rotation + 90) % 360;
    } else {
      this.rotation = (this.rotation - 90) % 360;
      if (this.rotation < 0) this.rotation += 360;
    }
  }

  getRotation(): number {
    return this.rotation;
  }

  getNativeEngineId(): string {
    return this.engineId;
  }

  async renderPage(
    pageIndex: number,
    target: any,
    scale: number,
    telemetry?: RenderPageTelemetryContext
  ): Promise<void | RenderPageResult> {
    const native = this.assertNativeModule();
    if (!native.renderPage) return;
    const viewTag = this.toNativeViewTag(target);
    if (viewTag === null) return;
    const requestId = `native-render-${++this.renderRequestCounter}`;
    return native.renderPage(
      this.engineId,
      pageIndex,
      viewTag,
      scale,
      this.zoom,
      this.rotation,
      requestId,
      telemetry
    );
  }

  async renderTextLayer(
    pageIndex: number,
    target: any,
    scale: number
  ): Promise<void> {
    const native = this.assertNativeModule();
    if (!native.renderTextLayer) return;
    const viewTag = this.toNativeViewTag(target);
    if (viewTag === null) return;
    native.renderTextLayer(
      this.engineId,
      pageIndex,
      viewTag,
      scale,
      this.zoom,
      this.rotation
    );
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    const native = this.assertNativeModule();
    if (!native.getTextContent) return [];
    return native.getTextContent(this.engineId, pageIndex);
  }

  async getPageDimensions(
    pageIndex: number
  ): Promise<{ width: number; height: number }> {
    const native = this.assertNativeModule();
    if (!native.getPageDimensions) return { width: 0, height: 0 };
    return native.getPageDimensions(this.engineId, pageIndex);
  }

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number },
    endpoints?: TextSelectionEndpoints
  ): Promise<TextSelection | null> {
    const native = this.assertNativeModule();
    if (!native.selectText) return null;
    return native.selectText(
      this.engineId,
      pageIndex,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      endpoints?.start.x ?? -1,
      endpoints?.start.y ?? -1,
      endpoints?.end.x ?? -1,
      endpoints?.end.y ?? -1
    );
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

  async getPageIndex(dest: PageDestination): Promise<number | null> {
    if (!dest) return null;
    if (typeof dest !== "string") {
      if (dest.kind === "pageIndex") return dest.value;
      if (dest.kind === "pageNumber") return Math.max(0, dest.value - 1);
    }

    const native = this.assertNativeModule();
    if (!native.getPageIndex) return null;
    const normalized = normalizeNativeDestination(dest);
    if (!normalized || normalized.kind !== "named") return null;
    return native.getPageIndex(this.engineId, normalized);
  }

  destroy(): void {
    this.nativeModule?.destroyEngine?.(this.engineId);
  }

  private assertNativeModule(): NativeEngineModule {
    if (!this.nativeModule) {
      this.nativeModule = resolveNativeModule();
    }
    if (!this.nativeModule) {
      throw new Error(
        `[Papyrus] Native module "${MODULE_NAME}" not found. Use a dev client or a native build (Expo Go is not supported).`
      );
    }
    return this.nativeModule;
  }

  private async normalizeSource(
    source: DocumentSource
  ): Promise<NativeDocumentSource> {
    if (typeof source === "string") {
      const dataUri = parseDataUri(source);
      if (dataUri?.isBase64) {
        return { data: decodeBase64(dataUri.data) };
      }
      if (looksLikeUri(source)) return { uri: source };
      if (isLikelyBase64(source)) return { data: decodeBase64(source) };
      return { uri: source };
    }
    if (this.isUriSource(source)) return { uri: source.uri };
    if (this.isDataSource(source)) {
      const data =
        source.data instanceof Uint8Array
          ? source.data
          : new Uint8Array(source.data);
      return { data };
    }
    if (this.isFileLike(source)) {
      const buffer = await source.arrayBuffer();
      return { data: new Uint8Array(buffer) };
    }
    if (source instanceof ArrayBuffer) return { data: new Uint8Array(source) };
    if (source instanceof Uint8Array) return { data: source };
    return { data: new Uint8Array(source as ArrayBuffer) };
  }

  private isUriSource(source: DocumentSource): source is { uri: string } {
    return typeof source === "object" && source !== null && "uri" in source;
  }

  private isDataSource(
    source: DocumentSource
  ): source is { data: ArrayBuffer | Uint8Array } {
    return typeof source === "object" && source !== null && "data" in source;
  }

  private isFileLike(source: DocumentSource): source is FileLike {
    return (
      typeof source === "object" &&
      source !== null &&
      typeof (source as FileLike).arrayBuffer === "function"
    );
  }

  private toNativeViewTag(target: any): number | null {
    if (typeof target === "number") return target;
    if (target?.nativeTag && typeof target.nativeTag === "number")
      return target.nativeTag;
    return null;
  }
}

export class NativeTextDocumentEngine extends BaseDocumentEngine {
  private nativeModule: NativeEngineModule | null = resolveNativeModule();
  private engineId: string = this.nativeModule?.createEngine?.() ?? "default";
  private loadGeneration = 0;
  private documentGeneration = 0;
  private textLength = 0;
  private currentOffset = 0;

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type } = normalizeLoadInput(input);
    if (type && type !== "text") {
      throw new Error("[NativeTextDocumentEngine] Unsupported type: " + type);
    }

    const generation = ++this.loadGeneration;
    if (this.documentGeneration > 0) {
      this.nativeModule?.closeText?.(this.engineId, this.documentGeneration);
    }
    this.documentGeneration = 0;
    this.textLength = 0;
    this.currentOffset = 0;
    const nativeSource = await normalizeNativeSource(source, true);
    if (generation !== this.loadGeneration) return;

    const native = this.assertNativeModule();
    if (!native.loadText) {
      throw new Error("[Papyrus] Native TXT loading is not available");
    }
    const result = await native.loadText(
      this.engineId,
      generation,
      nativeSource
    );
    if (generation !== this.loadGeneration) {
      native.closeText?.(this.engineId, generation);
      return;
    }
    this.documentGeneration = generation;
    this.textLength = Math.max(0, Math.floor(result.textLength));
    this.currentOffset = 0;
  }

  getNativeTextEngineId(): string {
    return this.engineId;
  }
  getDocumentGeneration(): number {
    return this.documentGeneration;
  }
  getTextLength(): number {
    return this.textLength;
  }
  getCurrentTextOffset(): number {
    return this.currentOffset;
  }
  goToTextOffset(offset: number): void {
    this.currentOffset = clampTextOffset(offset, this.textLength);
  }
  async resolveAnnotationTextRange(annotation:Annotation):Promise<{start:number;end:number}|null> {
    if(annotation.anchor?.kind!=="text-range")return annotation.textRange??null;
    const generation=this.documentGeneration;
    const range=await this.assertNativeModule().resolveTextAnnotationRange?.(this.engineId,generation,annotation.anchor);
    return generation===this.documentGeneration?range??null:null;
  }
  async getTextRange(start: number, end: number): Promise<string> {
    const native = this.assertNativeModule();
    if (!native.getTextRange) return "";
    return native.getTextRange(
      this.engineId,
      this.documentGeneration,
      clampTextOffset(start, this.textLength),
      clampTextOffset(end, this.textLength)
    );
  }
  async searchTextRanges(query: string): Promise<TextSearchResult[]> {
    const native = this.assertNativeModule();
    if (!native.searchTextRanges) return [];
    return native.searchTextRanges(this.engineId, this.documentGeneration, query);
  }
  getRenderTargetType(): RenderTargetType {
    return "native-text";
  }
  getPageCount(): number { return 0; }
  getCurrentPage(): number { return 1; }
  goToPage(page: number): void { void page; }
  setZoom(zoom: number): void { void zoom; }
  getZoom(): number { return 1; }
  rotate(direction: "clockwise" | "counterclockwise"): void { void direction; }
  getRotation(): number { return 0; }
  async renderPage(): Promise<void> {}
  async renderTextLayer(): Promise<void> {}
  async getTextContent(): Promise<TextItem[]> { return []; }
  async getPageDimensions(): Promise<{ width: number; height: number }> {
    return { width: 0, height: 0 };
  }
  async selectText(): Promise<TextSelection | null> { return null; }
  async getOutline(): Promise<OutlineItem[]> { return []; }
  async getPageIndex(): Promise<number | null> { return null; }
  destroy(): void {
    this.loadGeneration += 1;
    const engineId = this.engineId;
    if (this.documentGeneration > 0) {
      this.nativeModule?.closeText?.(engineId, this.documentGeneration);
    }
    this.nativeModule?.destroyEngine?.(engineId);
    this.engineId = "default";
    this.textLength = 0;
    this.currentOffset = 0;
    this.documentGeneration = 0;
  }
  private assertNativeModule(): NativeEngineModule {
    if (!this.nativeModule) this.nativeModule = resolveNativeModule();
    if (!this.nativeModule) {
      throw new Error('[Papyrus] Native module "PapyrusNativeEngine" not found. Use a dev client or native build.');
    }
    if (this.engineId === "default" && this.nativeModule.createEngine) {
      this.engineId = this.nativeModule.createEngine();
    }
    return this.nativeModule;
  }
}

export class NativeComicDocumentEngine extends BaseDocumentEngine {
  private nativeModule: NativeEngineModule | null = resolveNativeModule();
  private engineId: string = this.nativeModule?.createEngine?.() ?? "default";
  private loadGeneration = 0;
  private documentGeneration = 0;
  private pageCount = 0;
  private currentPage = 1;
  private zoom = 1;
  private format: ComicFormat = "cbz";

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type, format } = normalizeLoadInput(input);
    if (type && type !== "comic") {
      throw new Error("[NativeComicDocumentEngine] Unsupported type: " + type);
    }
    const generation = ++this.loadGeneration;
    if (this.documentGeneration > 0) {
      this.nativeModule?.closeComic?.(this.engineId, this.documentGeneration);
    }
    this.documentGeneration = 0;
    this.pageCount = 0;
    this.currentPage = 1;
    this.zoom = 1;
    const nativeSource = await normalizeNativeSource(source, false);
    if (generation !== this.loadGeneration) return;
    const native = this.assertNativeModule();
    if (!native.loadComic) {
      throw new Error("[Papyrus] Native comic archive loading is not available");
    }
    const engineId = this.engineId;
    this.format = resolveComicFormat(source, format);
    const result = await native.loadComic(
      engineId, generation, nativeSource, this.format
    );
    if (generation !== this.loadGeneration) {
      native.closeComic?.(engineId, generation);
      return;
    }
    this.documentGeneration = generation;
    this.pageCount = Math.max(0, Math.floor(result.pageCount));
    this.currentPage = 1;
  }
  getNativeComicEngineId(): string { return this.engineId; }
  getDocumentGeneration(): number { return this.documentGeneration; }
  getComicFormat(): ComicFormat { return this.format; }
  getPageCount(): number { return this.pageCount; }
  getCurrentPage(): number { return this.currentPage; }
  goToPage(page: number): void {
    if (page >= 1 && page <= this.pageCount) this.currentPage = page;
  }
  getRenderTargetType(): RenderTargetType { return "native-comic"; }
  async getPagePreview(pageIndex: number): Promise<string | null> {
    const native = this.assertNativeModule();
    return (await native.getComicPagePreview?.(
      this.engineId, this.documentGeneration, pageIndex, 1024
    )) ?? null;
  }
  setZoom(zoom: number): void { this.zoom = Math.max(1, Math.min(5, zoom)); }
  getZoom(): number { return this.zoom; }
  rotate(direction: "clockwise" | "counterclockwise"): void { void direction; }
  getRotation(): number { return 0; }
  async renderPage(): Promise<void> {}
  async renderTextLayer(): Promise<void> {}
  async getTextContent(): Promise<TextItem[]> { return []; }
  async getPageDimensions(): Promise<{ width: number; height: number }> {
    return { width: 0, height: 0 };
  }
  async selectText(): Promise<TextSelection | null> { return null; }
  async getOutline(): Promise<OutlineItem[]> { return []; }
  async getPageIndex(): Promise<number | null> { return null; }
  destroy(): void {
    this.loadGeneration += 1;
    const engineId = this.engineId;
    if (this.documentGeneration > 0) {
      this.nativeModule?.closeComic?.(engineId, this.documentGeneration);
    }
    this.nativeModule?.destroyEngine?.(engineId);
    this.engineId = "default";
    this.documentGeneration = 0;
    this.pageCount = 0;
    this.currentPage = 1;
    this.zoom = 1;
  }
  private assertNativeModule(): NativeEngineModule {
    if (!this.nativeModule) this.nativeModule = resolveNativeModule();
    if (!this.nativeModule) {
      throw new Error('[Papyrus] Native module "PapyrusNativeEngine" not found. Use a dev client or native build.');
    }
    if (this.engineId === "default" && this.nativeModule.createEngine) {
      this.engineId = this.nativeModule.createEngine();
    }
    return this.nativeModule;
  }
}

type WebViewBridge = {
  postMessage: (message: string) => void;
};

type Deferred<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

export type WebViewRuntimeSource =
  | string
  | number
  | { uri: string };

export type WebViewRuntimeConfig = Record<string, string>;

export type MobileDocumentEngineOptions = {
  /** Optional asset URI/require result for a runtime extension such as CBR. */
  webViewRuntimeSource?: WebViewRuntimeSource;
  webViewRuntimeConfig?: WebViewRuntimeConfig;
};

type WebViewResponseMessage = {
  type: "response";
  id: string;
  ok: boolean;
  data?: any;
  error?: string;
};

type WebViewEventMessage = {
  type: "event";
  name: string;
  payload?: any;
};

type WebViewStateMessage = {
  type: "state";
  payload: {
    pageCount?: number;
    currentPage?: number;
    zoom?: number;
    outline?: OutlineItem[];
  };
};

type WebViewAssetRequestMessage = {
  type: "asset-request";
  id: string;
  url: string;
  encoding: "text" | "base64";
};

type WebViewFileChunkRequestMessage = {
  type: "file-chunk-request";
  id: string;
  uri: string;
  offset: number;
  length: number;
};

type WebViewReadyMessage = {
  type: "ready";
};

type WebViewRuntimeMessage =
  | WebViewResponseMessage
  | WebViewEventMessage
  | WebViewStateMessage
  | WebViewAssetRequestMessage
  | WebViewFileChunkRequestMessage
  | WebViewReadyMessage;

type WebViewSourcePayload =
  | { kind: "uri"; uri: string }
  | { kind: "base64"; data: string; mime?: string }
  | { kind: "text"; text: string };

export class WebViewDocumentEngine extends BaseDocumentEngine {
  private documentSessionId = "";
  getWebViewDocumentSessionId(): string { return this.documentSessionId; }
  async syncEpubAnnotations(annotations: Annotation[], documentId?: string, labels?: {comment:string}): Promise<void> {
    if (!this.documentSessionId) return;
    await this.request("epub-annotations", { documentSessionId: this.documentSessionId, annotations, documentId, labels });
  }
  async goToAnnotation(annotation: Annotation): Promise<void> {
    if (annotation.anchor?.kind !== "epub-cfi") return;
    await this.request("epub-annotation-navigate", {documentSessionId: this.documentSessionId, annotationId: annotation.id});
  }
  private readonly webViewRuntimeSource?: WebViewRuntimeSource;
  private readonly webViewRuntimeConfig?: WebViewRuntimeConfig;
  private bridge: WebViewBridge | null = null;
  private ready = false;
  private requestId = 0;
  private pending = new Map<
    string,
    { resolve: (data: any) => void; reject: (error: Error) => void }
  >();
  private bridgeResolvers: Array<Deferred<WebViewBridge>> = [];
  private readyResolvers: Array<Deferred<void>> = [];
  private pageCount = 0;
  private currentPage = 1;
  private zoom = 1.0;
  private rotation = 0;
  private outline: OutlineItem[] = [];

  constructor(options: MobileDocumentEngineOptions = {}) {
    super();
    this.webViewRuntimeSource = options.webViewRuntimeSource;
    this.webViewRuntimeConfig = options.webViewRuntimeConfig;
  }

  getWebViewRuntimeSource(): WebViewRuntimeSource | undefined {
    return this.webViewRuntimeSource;
  }

  getWebViewRuntimeConfig(): WebViewRuntimeConfig | undefined {
    return this.webViewRuntimeConfig;
  }

  getRenderTargetType(): "webview" {
    return "webview";
  }

  getLifecycleStats(): Record<string, number> {
    return {
      webViewCount: this.bridge ? 1 : 0,
      pendingBridgeRequests: this.pending.size,
    };
  }

  attachBridge(bridge: WebViewBridge): void {
    this.bridge = bridge;
    this.ready = false;
    this.bridgeResolvers.forEach(({ resolve }) => resolve(bridge));
    this.bridgeResolvers = [];
  }

  detachBridge(): void {
    const error = new Error("[Papyrus] WebView detached");
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
    this.bridgeResolvers.forEach(({ reject }) => reject(error));
    this.readyResolvers.forEach(({ reject }) => reject(error));
    this.bridgeResolvers = [];
    this.readyResolvers = [];
    this.bridge = null;
    this.ready = false;
  }

  handleMessage(raw: string): void {
    let message: WebViewRuntimeMessage | null = null;
    try {
      message = JSON.parse(raw) as WebViewRuntimeMessage;
    } catch {
      return;
    }

    if (!message) return;

    if (message.type === "asset-request") {
      void this.handleAssetRequest(message);
      return;
    }

    if (message.type === "file-chunk-request") {
      void this.handleFileChunkRequest(message);
      return;
    }

    if (message.type === "ready") {
      this.ready = true;
      this.readyResolvers.forEach(({ resolve }) => resolve());
      this.readyResolvers = [];
      return;
    }

    if (message.type === "response") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) {
        pending.resolve(message.data);
      } else {
        pending.reject(
          new Error(message.error ?? "[Papyrus] WebView runtime error")
        );
      }
      return;
    }

    if (message.type === "state") {
      if (typeof message.payload.pageCount === "number")
        this.pageCount = message.payload.pageCount;
      if (typeof message.payload.currentPage === "number")
        this.currentPage = message.payload.currentPage;
      if (typeof message.payload.zoom === "number")
        this.zoom = message.payload.zoom;
      if (Array.isArray(message.payload.outline))
        this.outline = message.payload.outline;
      return;
    }

    if (message.type === "event") {
      const payload = message.payload ?? {};
      if (message.name === "RUNTIME_LOG") {
        if (__DEV__) {
          const text =
            typeof payload?.message === "string"
              ? payload.message
              : JSON.stringify(payload);
          console.log("[Papyrus WebView runtime]", text);
        }
        return;
      }
      if (message.name === "RUNTIME_ERROR") {
        const errorMessage =
          typeof payload?.message === "string" ? payload.message : "";
        if (errorMessage.includes("ResizeObserver loop")) {
          return;
        }
        if (__DEV__) {
          console.warn("[Papyrus WebView runtime]", payload);
        }
        return;
      }
      if (message.name === PapyrusEventType.TEXT_SELECTED) {
        papyrusEvents.emit(PapyrusEventType.TEXT_SELECTED, payload);
      } else if (message.name === PapyrusEventType.SEARCH_TRIGGERED) {
        papyrusEvents.emit(PapyrusEventType.SEARCH_TRIGGERED, payload);
      } else if (message.name === PapyrusEventType.DOCUMENT_LOADED) {
        if (typeof payload.pageCount === "number") {
          this.pageCount = payload.pageCount;
        }
        papyrusEvents.emit(PapyrusEventType.DOCUMENT_LOADED, payload);
      }
      return;
    }

    if (__DEV__) {
      console.warn("[Papyrus WebView] Unknown message", message);
    }
  }

  private async handleAssetRequest(
    message: WebViewAssetRequestMessage,
  ): Promise<void> {
    const bridge = this.bridge;
    if (!bridge) return;

    try {
      const response = await fetch(message.url);
      if (!response.ok) {
        throw new Error(`status ${response.status}`);
      }

      const data =
        message.encoding === "text"
          ? await response.text()
          : `data:application/wasm;base64,${encodeBase64(
              new Uint8Array(await response.arrayBuffer()),
            )}`;
      bridge.postMessage(
        JSON.stringify({
          type: "asset-response",
          id: message.id,
          ok: true,
          data,
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      bridge.postMessage(
        JSON.stringify({
          type: "asset-response",
          id: message.id,
          ok: false,
          error: reason,
        }),
      );
    }
  }

  private async handleFileChunkRequest(
    message: WebViewFileChunkRequestMessage,
  ): Promise<void> {
    const bridge = this.bridge;
    if (!bridge) return;

    try {
      const nativeModule = resolveNativeModule();
      if (!nativeModule?.readFileChunk) {
        throw new Error("Leitura nativa de arquivos não está disponível");
      }
      const result = await nativeModule.readFileChunk(
        message.uri,
        message.offset,
        message.length,
      );
      bridge.postMessage(
        JSON.stringify({
          type: "file-chunk-response",
          id: message.id,
          ok: true,
          data: result.data,
          done: result.done,
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      bridge.postMessage(
        JSON.stringify({
          type: "file-chunk-response",
          id: message.id,
          ok: false,
          error: reason,
        }),
      );
    }
  }

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type, format } = normalizeLoadInput(input);
    const resolvedType = type ?? inferDocumentType(source);
    if (resolvedType === "pdf") {
      throw new Error(
        "[WebViewDocumentEngine] Use o NativeDocumentEngine para PDFs no mobile."
      );
    }

    const session = `epub-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.documentSessionId = session;
    const payloadSource = await this.normalizeRuntimeSource(
      resolvedType,
      source
    );
    if(session !== this.documentSessionId) throw new Error("Stale document load");
    const response = await this.request<{
      pageCount?: number;
      outline?: OutlineItem[];
    }>("load", {
      type: resolvedType,
      documentSessionId: session,
      source: payloadSource,
      ...(resolvedType === "comic"
        ? { format: resolveComicFormat(source, format) }
        : {}),
    });
    if(session !== this.documentSessionId) throw new Error("Stale document load");

    if (typeof response?.pageCount === "number")
      this.pageCount = response.pageCount;
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
    void this.request("go-to-page", { page });
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.5, Math.min(4.0, zoom));
    void this.request("set-zoom", { zoom: this.zoom });
  }

  getZoom(): number {
    return this.zoom;
  }

  rotate(direction: "clockwise" | "counterclockwise"): void {
    if (direction === "clockwise") {
      this.rotation = (this.rotation + 90) % 360;
    } else {
      this.rotation = (this.rotation - 90) % 360;
      if (this.rotation < 0) this.rotation += 360;
    }
    void this.request("set-rotation", { rotation: this.rotation });
  }

  getRotation(): number {
    return this.rotation;
  }

  async renderPage(
    pageIndex: number,
    target: any,
    scale: number,
    _telemetry?: RenderPageTelemetryContext
  ): Promise<void> {
    void pageIndex;
    void target;
    void scale;
  }

  async renderTextLayer(
    pageIndex: number,
    container: any,
    scale: number
  ): Promise<void> {
    void pageIndex;
    void container;
    void scale;
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    return await this.request<TextItem[]>("get-text-content", { pageIndex });
  }

  async getPageDimensions(
    pageIndex: number
  ): Promise<{ width: number; height: number }> {
    return await this.request<{ width: number; height: number }>(
      "get-page-dimensions",
      { pageIndex }
    );
  }

  async getPagePreview(pageIndex: number): Promise<string | null> {
    return await this.request<string | null>("get-page-preview", {
      pageIndex,
    });
  }

  async searchText(query: string): Promise<SearchResult[]> {
    return await this.request<SearchResult[]>("search-text", { query });
  }

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number },
    endpoints?: TextSelectionEndpoints
  ): Promise<TextSelection | null> {
    return await this.request<TextSelection | null>("select-text", {
      pageIndex,
      rect,
      endpoints,
    });
  }

  async getOutline(): Promise<OutlineItem[]> {
    if (this.outline.length > 0) return this.outline;
    return await this.request<OutlineItem[]>("get-outline");
  }

  async getPageIndex(dest: PageDestination): Promise<number | null> {
    if (!dest) return null;
    if (typeof dest !== "string") {
      if (dest.kind === "pageIndex") return dest.value;
      if (dest.kind === "pageNumber") return Math.max(0, dest.value - 1);
      if (dest.kind === "href") {
        return await this.request<number | null>("get-page-index", {
          dest: dest.value,
        });
      }
      return null;
    }
    return await this.request<number | null>("get-page-index", { dest });
  }

  destroy(): void {
    this.detachBridge();
  }

  private async ensureBridge(): Promise<WebViewBridge> {
    if (this.bridge) return this.bridge;
    return new Promise((resolve, reject) => {
      this.bridgeResolvers.push({ resolve, reject });
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) return;
    return new Promise((resolve, reject) => {
      this.readyResolvers.push({ resolve, reject });
    });
  }

  private async request<T = any>(kind: string, payload?: any): Promise<T> {
    const bridge = await this.ensureBridge();
    await this.ensureReady();
    const id = `${Date.now()}-${this.requestId++}`;
    return new Promise<T>((resolve, reject) => {
      const timeoutMs =
        kind === "load" ? 180000 : kind === "get-page-preview" ? 30000 : 8000;
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

  private async normalizeRuntimeSource(
    type: DocumentType,
    source: DocumentSource
  ): Promise<WebViewSourcePayload> {
    if (typeof source === "string") {
      const dataUri = parseDataUri(source);
      if (dataUri) {
        if (dataUri.isBase64) {
          return {
            kind: "base64",
            data: dataUri.data,
            mime: dataUri.mime || undefined,
          };
        }
        const text = decodeURIComponent(dataUri.data);
        return { kind: "text", text };
      }

      if (looksLikeUri(source)) {
        if (isMetroAssetUri(source)) {
          return { kind: "uri", uri: source };
        }
        if (isHttpUri(source)) {
          const fetched = await this.fetchRemoteSource(type, source);
          if (fetched) return fetched;
        }
        if (isLocalUri(source)) {
          return await this.fetchLocalSource(type, source);
        }
        return { kind: "uri", uri: source };
      }

      if (isLikelyBase64(source)) {
        return { kind: "base64", data: source };
      }

      if (type === "text") {
        return { kind: "text", text: source };
      }

      return { kind: "uri", uri: source };
    }

    if (this.isUriSource(source)) {
      const uri = source.uri;
      const dataUri = parseDataUri(uri);
      if (dataUri) {
        if (dataUri.isBase64) {
          return {
            kind: "base64",
            data: dataUri.data,
            mime: dataUri.mime || undefined,
          };
        }
        return { kind: "text", text: decodeURIComponent(dataUri.data) };
      }
      if (isMetroAssetUri(uri)) {
        return { kind: "uri", uri };
      }
      if (isHttpUri(uri)) {
        const fetched = await this.fetchRemoteSource(type, uri);
        if (fetched) return fetched;
      }
      if (isLocalUri(uri)) {
        return await this.fetchLocalSource(type, uri);
      }
      return { kind: "uri", uri };
    }
    if (this.isDataSource(source)) {
      const bytes =
        source.data instanceof Uint8Array
          ? source.data
          : new Uint8Array(source.data);
      return { kind: "base64", data: encodeBase64(bytes) };
    }
    if (this.isFileLike(source)) {
      const buffer = await source.arrayBuffer();
      return { kind: "base64", data: encodeBase64(new Uint8Array(buffer)) };
    }
    if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
      const bytes =
        source instanceof Uint8Array ? source : new Uint8Array(source);
      return { kind: "base64", data: encodeBase64(bytes) };
    }

    return {
      kind: "base64",
      data: encodeBase64(new Uint8Array(source as ArrayBuffer)),
    };
  }

  private async fetchRemoteSource(
    type: DocumentType,
    uri: string
  ): Promise<WebViewSourcePayload | null> {
    try {
      const response = await fetch(uri);
      if (!response.ok) return null;
      if (type === "text") {
        const text = await response.text();
        return { kind: "text", text };
      }
      if (type === "epub") {
        const buffer = await this.readResponseBuffer(response);
        return { kind: "base64", data: encodeBase64(new Uint8Array(buffer)) };
      }
      if (type === "comic") {
        const buffer = await this.readResponseBuffer(response);
        return { kind: "base64", data: encodeBase64(new Uint8Array(buffer)) };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fetchLocalSource(
    type: DocumentType,
    uri: string
  ): Promise<WebViewSourcePayload> {
    if (type === "epub" || type === "comic") {
      return { kind: "uri", uri };
    }

    try {
      const response = await fetch(uri);
      if (!response.ok && response.status !== 0) {
        throw new Error(`status ${response.status}`);
      }
      if (type === "text") {
        return { kind: "text", text: await response.text() };
      }
      throw new Error(`tipo não suportado: ${type}`);
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(
        `[WebViewDocumentEngine] Não foi possível ler o arquivo local ${uri}${reason}`
      );
    }
  }

  private async readResponseBuffer(response: Response): Promise<ArrayBuffer> {
    try {
      return await response.arrayBuffer();
    } catch {
      const blob = await response.blob();
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () =>
          reject(new Error("[Papyrus] Failed to read response blob"));
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
    }
  }

  private isUriSource(source: DocumentSource): source is { uri: string } {
    return typeof source === "object" && source !== null && "uri" in source;
  }

  private isDataSource(
    source: DocumentSource
  ): source is { data: ArrayBuffer | Uint8Array } {
    return typeof source === "object" && source !== null && "data" in source;
  }

  private isFileLike(source: DocumentSource): source is FileLike {
    return (
      typeof source === "object" &&
      source !== null &&
      typeof (source as FileLike).arrayBuffer === "function"
    );
  }
}

export class MobileDocumentEngine extends BaseDocumentEngine {
  private pdfEngine: NativeDocumentEngine;
  private textEngine: NativeTextDocumentEngine;
  private comicEngine: NativeComicDocumentEngine;
  private webEngine: WebViewDocumentEngine;
  private activeEngine: DocumentEngine;
  private loadGeneration = 0;

  constructor(options: MobileDocumentEngineOptions = {}) {
    super();
    this.pdfEngine = new NativeDocumentEngine();
    this.textEngine = new NativeTextDocumentEngine();
    this.comicEngine = new NativeComicDocumentEngine();
    this.webEngine = new WebViewDocumentEngine(options);
    this.activeEngine = this.pdfEngine;
  }

  getWebViewRuntimeSource(): WebViewRuntimeSource | undefined {
    return this.webEngine.getWebViewRuntimeSource();
  }

  getWebViewRuntimeConfig(): WebViewRuntimeConfig | undefined {
    return this.webEngine.getWebViewRuntimeConfig();
  }

  getRenderTargetType(): RenderTargetType {
    return this.activeEngine.getRenderTargetType?.() ?? "canvas";
  }

  getNativeEngineId(): string | null {
    return this.activeEngine === this.pdfEngine
      ? this.pdfEngine.getNativeEngineId()
      : null;
  }

  getNativeTextEngineId(): string | null {
    return this.activeEngine === this.textEngine
      ? this.textEngine.getNativeTextEngineId()
      : null;
  }

  getNativeTextDocumentGeneration(): number {
    return this.activeEngine === this.textEngine
      ? this.textEngine.getDocumentGeneration()
      : 0;
  }

  getNativeComicEngineId(): string | null {
    return this.activeEngine === this.comicEngine
      ? this.comicEngine.getNativeComicEngineId()
      : null;
  }

  getNativeComicDocumentGeneration(): number {
    return this.activeEngine === this.comicEngine
      ? this.comicEngine.getDocumentGeneration()
      : 0;
  }

  getTextLength(): number {
    return this.activeEngine.getTextLength?.() ?? 0;
  }

  getCurrentTextOffset(): number {
    return this.activeEngine.getCurrentTextOffset?.() ?? 0;
  }

  goToTextOffset(offset: number): void {
    this.activeEngine.goToTextOffset?.(offset);
  }

  getLifecycleStats(): Record<string, number> {
    return {
      ...this.pdfEngine.getLifecycleStats(),
      ...this.webEngine.getLifecycleStats(),
    };
  }

  resolveAnnotationTextRange(annotation:Annotation):Promise<{start:number;end:number}|null> {return this.textEngine.resolveAnnotationTextRange(annotation);}
  getWebViewDocumentSessionId(): string { return this.webEngine.getWebViewDocumentSessionId(); }
  syncEpubAnnotations(annotations: Annotation[], documentId?: string, labels?: {comment:string}): Promise<void> { return this.webEngine.syncEpubAnnotations(annotations,documentId,labels); }
  goToAnnotation(annotation: Annotation): void | Promise<void> {
    if (annotation.anchor?.kind === "epub-cfi") return this.webEngine.goToAnnotation(annotation);
    if (annotation.anchor?.kind === "text-range") return this.textEngine.goToTextOffset(annotation.anchor.start);
    this.activeEngine.goToPage((annotation.anchor?.kind === "pdf-geometry" ? annotation.anchor.pageIndex : annotation.pageIndex)+1);
  }

  attachWebView(bridge: WebViewBridge): void {
    this.webEngine.attachBridge(bridge);
  }

  detachWebView(): void {
    this.webEngine.detachBridge();
  }

  handleWebViewMessage(data: string): void {
    this.webEngine.handleMessage(data);
  }

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type, format } = normalizeLoadInput(input);
    const resolvedType = type ?? inferDocumentType(source);
    const generation = ++this.loadGeneration;
    const route = resolveNativeMobileDocumentRoute({
      type: resolvedType,
      format: resolvedType === "comic" ? resolveComicFormat(source, format) : undefined,
      platform: Platform.OS,
      nativeModuleAvailable: resolveNativeModule() !== null,
      nativeViewAvailable:
        resolvedType === "text"
          ? isPapyrusTextDocumentViewAvailable()
          : resolvedType === "comic"
            ? isPapyrusComicDocumentViewAvailable()
            : true,
    });
    const nextEngine =
      route === "native-pdf"
        ? this.pdfEngine
        : route === "native-text"
          ? this.textEngine
          : route === "native-comic"
            ? this.comicEngine
            : this.webEngine;

    if (this.activeEngine !== nextEngine) this.activeEngine.destroy();
    this.activeEngine = nextEngine;
    await nextEngine.load({
      type: resolvedType,
      source,
      ...(resolvedType === "comic" && format ? { format } : {}),
    });
    if (generation !== this.loadGeneration && this.activeEngine !== nextEngine) {
      return;
    }
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

  rotate(direction: "clockwise" | "counterclockwise"): void {
    this.activeEngine.rotate(direction);
  }

  getRotation(): number {
    return this.activeEngine.getRotation();
  }

  async renderPage(
    pageIndex: number,
    target: any,
    scale: number,
    telemetry?: RenderPageTelemetryContext
  ): Promise<void> {
    await this.activeEngine.renderPage(pageIndex, target, scale, telemetry);
  }

  async renderTextLayer(
    pageIndex: number,
    container: any,
    scale: number
  ): Promise<void> {
    await this.activeEngine.renderTextLayer(pageIndex, container, scale);
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    return await this.activeEngine.getTextContent(pageIndex);
  }

  async getPageDimensions(
    pageIndex: number
  ): Promise<{ width: number; height: number }> {
    return await this.activeEngine.getPageDimensions(pageIndex);
  }

  async getPagePreview(pageIndex: number): Promise<string | null> {
    const engine = this.activeEngine as DocumentEngine & {
      getPagePreview?: (pageIndex: number) => Promise<string | null>;
    };
    return (await engine.getPagePreview?.(pageIndex)) ?? null;
  }

  async searchText(query: string): Promise<SearchResult[]> {
    if (typeof this.activeEngine.searchText === "function") {
      return await this.activeEngine.searchText(query);
    }
    return [];
  }

  async searchTextRanges(query: string): Promise<TextSearchResult[]> {
    if (typeof this.activeEngine.searchTextRanges === "function") {
      return await this.activeEngine.searchTextRanges(query);
    }
    return [];
  }

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number },
    endpoints?: TextSelectionEndpoints
  ): Promise<TextSelection | null> {
    if (typeof this.activeEngine.selectText === "function") {
      return await this.activeEngine.selectText(pageIndex, rect, endpoints);
    }
    return null;
  }

  async getOutline(): Promise<OutlineItem[]> {
    return await this.activeEngine.getOutline();
  }

  async getPageIndex(dest: PageDestination): Promise<number | null> {
    return await this.activeEngine.getPageIndex(dest);
  }

  destroy(): void {
    this.loadGeneration += 1;
    this.pdfEngine.destroy();
    this.textEngine.destroy();
    this.comicEngine.destroy();
    this.webEngine.destroy();
  }
}
