import { describe, expect, it, vi } from "vitest";
import type { DocumentEngine } from "@papyrus-sdk/types";
import { loadDocumentFromUpload } from "./uploadDocument";

describe("loadDocumentFromUpload", () => {
  it("publica a contagem antes de um outline com falha", async () => {
    const engine = {
      load: vi.fn().mockResolvedValue(undefined),
      getPageCount: vi.fn().mockReturnValue(1000),
      getOutline: vi.fn().mockRejectedValue(new Error("outline indisponível")),
    } as unknown as DocumentEngine;
    const setDocumentState = vi.fn();
    const file = { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)) };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await loadDocumentFromUpload(engine, file, setDocumentState);

    expect(setDocumentState).toHaveBeenNthCalledWith(2, {
      isLoaded: true,
      pageCount: 1000,
      currentPage: 1,
      scrollToPageSignal: 0,
    });

    vi.restoreAllMocks();
  });
});
