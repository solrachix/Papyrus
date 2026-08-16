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
        pageText: (pageNumber) => {
          if (!core) return "";
          try {
            return core.page_text(pageNumber) ?? "";
          } catch {
            return "";
          }
        },
        search: (query) => {
          if (!core) return [];
          return core.search(query) ?? [];
        },
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
    let nextRuntime: RustPdfRuntime | null = null;
    try {
      nextRuntime = await this.runtimeFactory.load(bytes);
    } catch (error) {
      console.warn(
        "[RustDocumentEngine] WASM indisponível; usando o engine PDF.js",
        error
      );
    }

    try {
      await this.pdfEngine.load({ type: "pdf", source: bytes });
    } catch (error) {
      nextRuntime?.destroy?.();
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

  async searchText(query: string): Promise<SearchResult[]> {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return [];
    if (!this.runtime) return this.searchWithPdfEngine(query);

    let hits: RustSearchHit[];
    try {
      hits = this.runtime.search(query);
    } catch (error) {
      console.warn(
        "[RustDocumentEngine] Busca Rust indisponível; usando o engine PDF.js",
        error
      );
      return this.searchWithPdfEngine(query);
    }

    const results: SearchResult[] = [];
    for (const hit of hits) {
      let pageText: string;
      try {
        pageText = this.runtime.pageText(hit.page_number);
      } catch (error) {
        console.warn(
          `[RustDocumentEngine] Texto indisponível na página ${hit.page_number}; ignorando resultado`,
          error
        );
        continue;
      }
      if (!pageText) continue;

      const ranges = findCaseInsensitiveMatches(
        pageText,
        normalizedQuery
      );
      if (ranges.length === 0 && hit.matches > 0) {
        console.warn(
          `[RustDocumentEngine] O índice encontrou ${hit.matches} ocorrência(s) na página ${hit.page_number}, mas o texto não pôde ser mapeado`
        );
        results.push({
          pageIndex: hit.page_number - 1,
          text: createSnippet(pageText, 0, 0),
          matchIndex: 0,
        });
        continue;
      }

      for (const [matchIndex, range] of ranges
        .slice(0, hit.matches)
        .entries()) {
        results.push({
          pageIndex: hit.page_number - 1,
          text: createSnippet(pageText, range.start, range.end),
          matchIndex,
        });
      }
    }
    return results;
  }

  private async searchWithPdfEngine(query: string): Promise<SearchResult[]> {
    if (typeof this.pdfEngine.searchText === "function") {
      return this.pdfEngine.searchText(query);
    }

    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return [];

    const results: SearchResult[] = [];
    for (
      let pageIndex = 0;
      pageIndex < this.pdfEngine.getPageCount();
      pageIndex += 1
    ) {
      let textItems: TextItem[];
      try {
        textItems = await this.pdfEngine.getTextContent(pageIndex);
      } catch (error) {
        console.warn(
          `[RustDocumentEngine] Texto PDF.js indisponível na página ${pageIndex + 1}; ignorando página`,
          error
        );
        continue;
      }
      const pageText = textItems.map((item) => item.str).join(" ");
      for (const [matchIndex, range] of findCaseInsensitiveMatches(
        pageText,
        normalizedQuery
      ).entries()) {
        results.push({
          pageIndex,
          text: createSnippet(pageText, range.start, range.end),
          matchIndex,
        });
      }
    }
    return results;
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
    try {
      this.runtime?.destroy?.();
    } catch (error) {
      console.warn("[RustDocumentEngine] Falha ao liberar runtime", error);
    }
    this.runtime = null;
    this.pdfEngine.destroy();
  }
}

function createSnippet(text: string, start: number, end: number): string {
  const snippetStart = Math.max(0, start - 40);
  const snippetEnd = Math.min(text.length, end + 40);
  return text.substring(snippetStart, snippetEnd);
}

function findCaseInsensitiveMatches(
  text: string,
  normalizedQuery: string
): Array<{ start: number; end: number }> {
  if (!normalizedQuery) return [];

  let normalizedText = "";
  const originalStarts: number[] = [];
  const originalEnds: number[] = [];
  for (let index = 0; index < text.length; ) {
    const codePoint = String.fromCodePoint(text.codePointAt(index) ?? 0);
    if (/\s/u.test(codePoint)) {
      if (normalizedText.endsWith(" ")) {
        originalEnds[originalEnds.length - 1] = index + codePoint.length;
      } else {
        normalizedText += " ";
        originalStarts.push(index);
        originalEnds.push(index + codePoint.length);
      }
      index += codePoint.length;
      continue;
    }
    const normalizedCodePoint = codePoint.toLowerCase();
    normalizedText += normalizedCodePoint;
    for (let offset = 0; offset < normalizedCodePoint.length; offset += 1) {
      originalStarts.push(index);
      originalEnds.push(index + codePoint.length);
    }
    index += codePoint.length;
  }

  const matches: Array<{ start: number; end: number }> = [];
  let position = normalizedText.indexOf(normalizedQuery);
  while (position !== -1) {
    const endPosition = position + normalizedQuery.length - 1;
    matches.push({
      start: originalStarts[position] ?? 0,
      end: originalEnds[endPosition] ?? originalStarts[position] ?? 0,
    });
    position = normalizedText.indexOf(
      normalizedQuery,
      position + Math.max(normalizedQuery.length, 1)
    );
  }
  return matches;
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
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
