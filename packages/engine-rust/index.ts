import { BaseDocumentEngine } from "@papyrus-sdk/core";
import type {
  DocumentEngine,
  DocumentLoadInput,
  DocumentSource,
  FileLike,
  OutlineItem,
  PageDestination,
  SearchResult,
  TextItem,
  TextSelection,
} from "@papyrus-sdk/types";
import * as bundledWasmModule from "./wasm/papyrus_core_rust.js";

export interface RustSearchHit {
  page_number: number;
  matches: number;
}

export interface RustPdfRuntime {
  readonly pageCount: number;
  pageText(pageNumber: number): string;
  search(query: string): RustSearchHit[];
  destroy?(): void;
}

export interface RustPdfRuntimeFactory {
  load(bytes: Uint8Array): Promise<RustPdfRuntime>;
}

export interface RustDocumentEngineOptions {
  pdfEngine: DocumentEngine;
  runtimeFactory: RustPdfRuntimeFactory;
}

export interface WasmRustPdfCore {
  page_count(): number;
  page_text(pageNumber: number): string;
  search(query: string): RustSearchHit[];
  free?(): void;
}

export interface WasmRustPdfModule {
  default?(moduleOrPath?: unknown): Promise<unknown> | unknown;
  WasmPdfCore: new (bytes: Uint8Array) => WasmRustPdfCore;
}

export function createWasmRustRuntimeFactory(
  loadModule: () => Promise<WasmRustPdfModule>
): RustPdfRuntimeFactory {
  return {
    async load(bytes) {
      const module = await loadModule();
      if (module.default) await module.default();
      let core: WasmRustPdfCore | null = new module.WasmPdfCore(bytes);
      return {
        get pageCount() {
          return core?.page_count() ?? 0;
        },
        pageText: (pageNumber) => core?.page_text(pageNumber) ?? "",
        search: (query) => core?.search(query) ?? [],
        destroy: () => {
          if (!core) return;
          const currentCore = core;
          core = null;
          try {
            currentCore.free?.();
          } catch (error) {
            console.warn("[RustDocumentEngine] Falha ao liberar runtime anterior", error);
          }
        },
      };
    },
  };
}

export function createBundledWasmRustRuntimeFactory(): RustPdfRuntimeFactory {
  return createWasmRustRuntimeFactory(async () =>
    bundledWasmModule as unknown as WasmRustPdfModule
  );
}

export class RustDocumentEngine extends BaseDocumentEngine {
  private readonly pdfEngine: DocumentEngine;
  private readonly runtimeFactory: RustPdfRuntimeFactory;
  private runtime: RustPdfRuntime | null = null;

  constructor(options: RustDocumentEngineOptions) {
    super();
    this.pdfEngine = options.pdfEngine;
    this.runtimeFactory = options.runtimeFactory;
  }

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type } = normalizeLoadInput(input);
    if (type && type !== "pdf") {
      throw new Error(`[RustDocumentEngine] Tipo de documento não suportado: ${type}`);
    }

    const bytes = await resolvePdfBytes(source);
    const nextRuntime = await this.runtimeFactory.load(bytes);

    try {
      await this.pdfEngine.load({ type: "pdf", source: bytes });
    } catch (error) {
      nextRuntime.destroy?.();
      throw error;
    }

    const previousRuntime = this.runtime;
    this.runtime = nextRuntime;
    try {
      previousRuntime?.destroy?.();
    } catch (error) {
      console.warn(
        "[RustDocumentEngine] Falha ao descartar runtime anterior",
        error
      );
    }
  }

  getPageCount(): number {
    return this.runtime?.pageCount ?? this.pdfEngine.getPageCount();
  }

  getCurrentPage(): number {
    return this.pdfEngine.getCurrentPage();
  }

  goToPage(page: number): void {
    this.pdfEngine.goToPage(page);
  }

  setZoom(zoom: number): void {
    this.pdfEngine.setZoom(zoom);
  }

  getZoom(): number {
    return this.pdfEngine.getZoom();
  }

  rotate(direction: "clockwise" | "counterclockwise"): void {
    this.pdfEngine.rotate(direction);
  }

  getRotation(): number {
    return this.pdfEngine.getRotation();
  }

  renderPage(pageIndex: number, target: any, scale: number): Promise<void> {
    return this.pdfEngine.renderPage(pageIndex, target, scale);
  }

  renderTextLayer(
    pageIndex: number,
    container: any,
    scale: number
  ): Promise<void> {
    return this.pdfEngine.renderTextLayer(pageIndex, container, scale);
  }

  getTextContent(pageIndex: number): Promise<TextItem[]> {
    return this.pdfEngine.getTextContent(pageIndex);
  }

  getPageDimensions(
    pageIndex: number
  ): Promise<{ width: number; height: number }> {
    return this.pdfEngine.getPageDimensions(pageIndex);
  }

  searchText(query: string): Promise<SearchResult[]> {
    if (!this.runtime) return Promise.resolve([]);

    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return Promise.resolve([]);

    const results: SearchResult[] = [];
    for (const hit of this.runtime.search(query)) {
      const pageText = this.runtime.pageText(hit.page_number);
      const lowerPageText = pageText.toLocaleLowerCase();
      let position = lowerPageText.indexOf(normalizedQuery);
      let matchIndex = 0;

      while (position !== -1) {
        results.push({
          pageIndex: hit.page_number - 1,
          text: createSnippet(pageText, position, normalizedQuery.length),
          matchIndex,
        });
        matchIndex += 1;
        position = lowerPageText.indexOf(
          normalizedQuery,
          position + Math.max(normalizedQuery.length, 1)
        );
      }

      if (matchIndex === 0 && hit.matches > 0) {
        results.push({
          pageIndex: hit.page_number - 1,
          text: createSnippet(pageText, 0, normalizedQuery.length),
          matchIndex: 0,
        });
      }
    }
    return Promise.resolve(results);
  }

  selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null> {
    return this.pdfEngine.selectText(pageIndex, rect);
  }

  getOutline(): Promise<OutlineItem[]> {
    return this.pdfEngine.getOutline();
  }

  getPageIndex(dest: PageDestination): Promise<number | null> {
    return this.pdfEngine.getPageIndex(dest);
  }

  getRenderTargetType() {
    return this.pdfEngine.getRenderTargetType?.() ?? "canvas";
  }

  getPageLayoutMode() {
    return this.pdfEngine.getPageLayoutMode?.();
  }

  destroy(): void {
    this.runtime?.destroy?.();
    this.runtime = null;
    this.pdfEngine.destroy();
  }
}

function createSnippet(text: string, position: number, queryLength: number): string {
  const start = Math.max(0, position - 40);
  const end = Math.min(text.length, position + queryLength + 40);
  return text.substring(start, end);
}

function normalizeLoadInput(input: DocumentLoadInput): {
  source: DocumentSource;
  type?: "pdf" | "epub" | "text" | "comic";
} {
  if (
    typeof input === "object" &&
    input !== null &&
    "source" in input &&
    "type" in input
  ) {
    return { source: input.source, type: input.type };
  }
  return { source: input as DocumentSource };
}

async function resolvePdfBytes(source: DocumentSource): Promise<Uint8Array> {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (isDataSource(source)) return toUint8Array(source.data);
  if (isFileLike(source)) return new Uint8Array(await source.arrayBuffer());

  if (typeof source === "object" && source !== null && "uri" in source) {
    return fetchBytes(source.uri);
  }

  if (typeof source === "string") {
    const dataUri = parseDataUri(source);
    if (dataUri?.isBase64) return decodeBase64(dataUri.data);
    if (dataUri) return new TextEncoder().encode(decodeURIComponent(dataUri.data));
    if (isLikelyBase64(source)) return decodeBase64(source);
    return fetchBytes(source);
  }

  throw new Error("[RustDocumentEngine] Fonte de PDF não suportada.");
}

async function fetchBytes(uri: string): Promise<Uint8Array> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(
      `[RustDocumentEngine] Falha ao baixar PDF (${response.status} ${response.statusText}).`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}

function toUint8Array(value: ArrayBuffer | Uint8Array): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function isDataSource(source: DocumentSource): source is { data: ArrayBuffer | Uint8Array } {
  return typeof source === "object" && source !== null && "data" in source;
}

function isFileLike(source: DocumentSource): source is FileLike {
  return (
    typeof source === "object" &&
    source !== null &&
    typeof (source as FileLike).arrayBuffer === "function"
  );
}

function parseDataUri(value: string): { isBase64: boolean; data: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(value);
  if (!match) return null;
  return { isBase64: Boolean(match[2]), data: match[3] ?? "" };
}

function decodeBase64(value: string): Uint8Array {
  if (typeof atob !== "function") {
    throw new Error("[RustDocumentEngine] atob não está disponível.");
  }
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isLikelyBase64(value: string): boolean {
  return value.length >= 16 && /^[A-Za-z0-9+/=]+$/.test(value);
}
