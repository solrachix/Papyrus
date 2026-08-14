import { BaseDocumentEngine } from "@papyrus-sdk/core";
import {
  DocumentLoadInput,
  DocumentSource,
  DocumentType,
  FileLike,
  OutlineItem,
  PageDestination,
  TextItem,
  TextSelection,
} from "@papyrus-sdk/types";
import {
  ComicArchiveEntry,
  filterAndSortComicEntries,
} from "./archiveEntries";
import {
  ComicPageUrlCache,
  DEFAULT_COMIC_PAGE_CACHE_SIZE,
} from "./pageUrlCache";

export type ComicArchive = {
  entries: ComicArchiveEntry[];
  dispose?: () => void | Promise<void>;
};

export type ComicEngineOptions = {
  maxCachedPages?: number;
};

const IMAGE_MIME_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

export const comicMimeTypeForName = (name: string): string => {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_MIME_TYPES[extension] ?? "application/octet-stream";
};

export const resolveComicSourceToBlob = async (
  source: DocumentSource
): Promise<Blob> => {
  const toBlobPart = (value: ArrayBuffer | Uint8Array): BlobPart =>
    value instanceof Uint8Array ? value.slice().buffer : value;

  if (typeof source === "string") {
    if (source.startsWith("data:") || /^https?:\/\//.test(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`Falha ao carregar quadrinho: HTTP ${response.status}`);
      }
      return response.blob();
    }
    throw new Error(
      "A engine de quadrinhos precisa de uma URL, data URI ou arquivo."
    );
  }

  if (typeof source === "object" && source !== null && "uri" in source) {
    const response = await fetch(source.uri);
    if (!response.ok) {
      throw new Error(`Falha ao carregar quadrinho: HTTP ${response.status}`);
    }
    return response.blob();
  }

  if (typeof source === "object" && source !== null && "data" in source) {
    return new Blob([toBlobPart(source.data)]);
  }

  if (typeof Blob !== "undefined" && source instanceof Blob) {
    return source;
  }

  if (typeof source === "object" && source !== null && "arrayBuffer" in source) {
    return new Blob([await (source as FileLike).arrayBuffer()]);
  }

  if (source instanceof ArrayBuffer || source instanceof Uint8Array) {
    return new Blob([toBlobPart(source)]);
  }

  throw new Error("Fonte de quadrinho inválida.");
};

export abstract class ComicEngine extends BaseDocumentEngine {
  private archive: ComicArchive | null = null;
  private pages: ComicArchiveEntry[] = [];
  private pageUrls: ComicPageUrlCache;
  private pageSizes = new Map<number, { width: number; height: number }>();
  private currentPage = 1;
  private zoom = 1;
  private rotation = 0;

  constructor(options: ComicEngineOptions = {}) {
    super();
    this.pageUrls = new ComicPageUrlCache(
      options.maxCachedPages ?? DEFAULT_COMIC_PAGE_CACHE_SIZE
    );
  }

  protected abstract openArchive(source: DocumentSource): Promise<ComicArchive>;

  getRenderTargetType(): "element" {
    return "element";
  }

  getPageLayoutMode(): "continuous" {
    return "continuous";
  }

  async load(input: DocumentLoadInput): Promise<void> {
    const { source, type } = this.normalizeLoadInput(input);
    if (type && type !== "comic") {
      throw new Error(`[ComicEngine] Tipo de documento não suportado: ${type}`);
    }

    this.destroy();
    const archive = await this.openArchive(source);
    const pages = filterAndSortComicEntries(archive.entries);
    if (pages.length === 0) {
      await archive.dispose?.();
      throw new Error("[ComicEngine] O arquivo não contém páginas de imagem.");
    }

    this.archive = archive;
    this.pages = pages;
    this.currentPage = 1;
    this.pageSizes.clear();
  }

  getPageCount(): number {
    return this.pages.length;
  }

  getCurrentPage(): number {
    return this.currentPage;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.getPageCount()) this.currentPage = page;
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.2, Math.min(5, zoom));
  }

  getZoom(): number {
    return this.zoom;
  }

  rotate(direction: "clockwise" | "counterclockwise"): void {
    if (direction === "clockwise") {
      this.rotation = (this.rotation + 90) % 360;
      return;
    }
    this.rotation = (this.rotation - 90) % 360;
    if (this.rotation < 0) this.rotation += 360;
  }

  getRotation(): number {
    return this.rotation;
  }

  async renderPage(pageIndex: number, target: any): Promise<void> {
    const element = target as HTMLElement | null;
    const page = this.pages[pageIndex];
    if (!element || !page) return;

    let objectUrl = this.pageUrls.get(pageIndex);
    if (!objectUrl) {
      const blob = await page.read();
      objectUrl = URL.createObjectURL(blob);
      this.pageUrls.set(pageIndex, objectUrl, this.currentPage - 1);
    }

    const image = document.createElement("img");
    image.src = objectUrl;
    image.alt = `Página ${pageIndex + 1}`;
    image.draggable = false;
    image.decoding = "async";
    image.style.display = "block";
    image.style.width = "100%";
    image.style.height = "auto";
    image.style.userSelect = "none";
    image.style.transform = `rotate(${this.rotation}deg)`;

    element.replaceChildren(image);
    if (typeof image.decode === "function") {
      await image.decode().catch(() => undefined);
    }

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) {
      this.pageSizes.set(pageIndex, { width, height });
    }
  }

  async renderTextLayer(
    _pageIndex: number,
    container: any,
    _scale: number
  ): Promise<void> {
    const element = container as HTMLElement | null;
    if (element) element.replaceChildren();
  }

  async getTextContent(_pageIndex: number): Promise<TextItem[]> {
    return [];
  }

  async getPageDimensions(
    pageIndex: number
  ): Promise<{ width: number; height: number }> {
    return this.pageSizes.get(pageIndex) ?? { width: 0, height: 0 };
  }

  async selectText(
    _pageIndex: number,
    _rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null> {
    return null;
  }

  async getOutline(): Promise<OutlineItem[]> {
    return [];
  }

  async getPageIndex(dest: PageDestination): Promise<number | null> {
    if (!dest || typeof dest === "string") return null;
    if (dest.kind === "pageIndex") return dest.value;
    if (dest.kind === "pageNumber") return Math.max(0, dest.value - 1);
    return null;
  }

  destroy(): void {
    this.pageUrls.clear();
    void this.archive?.dispose?.();
    this.archive = null;
    this.pages = [];
    this.pageSizes.clear();
    this.currentPage = 1;
  }

  private normalizeLoadInput(input: DocumentLoadInput): {
    source: DocumentSource;
    type?: DocumentType;
  } {
    if (this.isLoadRequest(input)) {
      return { source: input.source, type: input.type };
    }
    return { source: input };
  }

  private isLoadRequest(
    input: DocumentLoadInput
  ): input is Extract<DocumentLoadInput, { source: DocumentSource }> {
    return (
      typeof input === "object" &&
      input !== null &&
      "source" in input &&
      "type" in input
    );
  }
}

export * from "./archiveEntries";
