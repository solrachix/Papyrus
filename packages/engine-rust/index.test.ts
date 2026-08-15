import { describe, expect, it, vi } from "vitest";
import type {
  DocumentEngine,
  SearchResult,
  TextItem,
} from "@papyrus-sdk/types";
import {
  RustDocumentEngine,
  type RustPdfRuntime,
  type RustPdfRuntimeFactory,
} from "./index";

function createPdfEngine(): DocumentEngine & {
  load: ReturnType<typeof vi.fn>;
  renderPage: ReturnType<typeof vi.fn>;
} {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    getPageCount: vi.fn().mockReturnValue(1),
    getCurrentPage: vi.fn().mockReturnValue(1),
    goToPage: vi.fn(),
    setZoom: vi.fn(),
    getZoom: vi.fn().mockReturnValue(1),
    rotate: vi.fn(),
    getRotation: vi.fn().mockReturnValue(0),
    renderPage: vi.fn().mockResolvedValue(undefined),
    renderTextLayer: vi.fn().mockResolvedValue(undefined),
    getTextContent: vi.fn().mockResolvedValue([] as TextItem[]),
    getPageDimensions: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
    selectText: vi.fn().mockResolvedValue(null),
    getOutline: vi.fn().mockResolvedValue([]),
    getPageIndex: vi.fn().mockResolvedValue(null),
    destroy: vi.fn(),
  };
}

function createRuntimeFactory(runtime: RustPdfRuntime): RustPdfRuntimeFactory {
  return { load: vi.fn().mockResolvedValue(runtime) };
}

describe("RustDocumentEngine", () => {
  it("carrega o mesmo PDF no renderer e no core Rust", async () => {
    const pdfEngine = createPdfEngine();
    const runtime = {
      pageCount: 1,
      pageText: vi.fn().mockReturnValue("Rust document"),
      search: vi.fn().mockReturnValue([]),
      destroy: vi.fn(),
    } satisfies RustPdfRuntime;
    const runtimeFactory = createRuntimeFactory(runtime);
    const source = new Uint8Array([37, 80, 68, 70]);
    const engine = new RustDocumentEngine({ pdfEngine, runtimeFactory });

    await engine.load({ type: "pdf", source });

    expect(pdfEngine.load).toHaveBeenCalledWith({ type: "pdf", source });
    expect(runtimeFactory.load).toHaveBeenCalledWith(source);
    expect(engine.getPageCount()).toBe(1);
  });

  it("mapeia ocorrências Rust para resultados da SearchService", async () => {
    const pdfEngine = createPdfEngine();
    const runtime = {
      pageCount: 1,
      pageText: vi.fn().mockReturnValue("Rust document. Rust is fast."),
      search: vi.fn().mockReturnValue([{ page_number: 1, matches: 2 }]),
      destroy: vi.fn(),
    } satisfies RustPdfRuntime;
    const engine = new RustDocumentEngine({
      pdfEngine,
      runtimeFactory: createRuntimeFactory(runtime),
    });
    await engine.load(new Uint8Array([1, 2, 3]));

    const results: SearchResult[] = await engine.searchText("rust");

    expect(runtime.search).toHaveBeenCalledWith("rust");
    expect(results).toEqual([
      { pageIndex: 0, text: "Rust document. Rust is fast.", matchIndex: 0 },
      { pageIndex: 0, text: "Rust document. Rust is fast.", matchIndex: 1 },
    ]);
  });

  it("mantém operações de renderização no engine PDF", async () => {
    const pdfEngine = createPdfEngine();
    const engine = new RustDocumentEngine({
      pdfEngine,
      runtimeFactory: createRuntimeFactory({
        pageCount: 1,
        pageText: () => "",
        search: () => [],
        destroy: vi.fn(),
      }),
    });
    const target = {};

    await engine.renderPage(0, target, 1);

    expect(pdfEngine.renderPage).toHaveBeenCalledWith(0, target, 1);
  });

  it("usa a contagem do core Rust depois de um upload", async () => {
    const pdfEngine = createPdfEngine();
    const runtime = {
      pageCount: 1000,
      pageText: () => "",
      search: () => [],
      destroy: vi.fn(),
    } satisfies RustPdfRuntime;
    const engine = new RustDocumentEngine({
      pdfEngine,
      runtimeFactory: createRuntimeFactory(runtime),
    });

    await engine.load(new Uint8Array([1, 2, 3]));

    expect(engine.getPageCount()).toBe(1000);
  });

  it("mantém o novo documento se a limpeza do runtime anterior falhar", async () => {
    const pdfEngine = createPdfEngine();
    const oldRuntime = {
      pageCount: 14,
      pageText: () => "",
      search: () => [],
      destroy: vi.fn(() => {
        throw new Error("runtime ainda emprestado");
      }),
    } satisfies RustPdfRuntime;
    const nextRuntime = {
      pageCount: 1000,
      pageText: () => "",
      search: () => [],
      destroy: vi.fn(),
    } satisfies RustPdfRuntime;
    const runtimeFactory: RustPdfRuntimeFactory = {
      load: vi
        .fn()
        .mockResolvedValueOnce(oldRuntime)
        .mockResolvedValueOnce(nextRuntime),
    };
    const engine = new RustDocumentEngine({ pdfEngine, runtimeFactory });

    await engine.load(new Uint8Array([1]));
    await engine.load(new Uint8Array([2]));

    expect(engine.getPageCount()).toBe(1000);
  });
});
