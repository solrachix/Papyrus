import { describe, expect, it } from "vitest";
import type { DocumentEngine, TextItem } from "@papyrus-sdk/types";
import { SearchService } from "./search-service";

const item = (str: string): TextItem => ({
  str,
  dir: "ltr",
  width: 1,
  height: 1,
  transform: [],
  fontName: "test",
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe("SearchService fallback", () => {
  it("prefers the engine search implementation when it is available", async () => {
    const engineSearch = async () => [
      { pageIndex: 4, text: "casa", matchIndex: 0 },
    ];
    const engine = {
      getPageCount: () => {
        throw new Error("fallback should not run");
      },
      searchText: engineSearch,
    } as unknown as DocumentEngine;

    await expect(new SearchService(engine).search("casa")).resolves.toEqual(
      await engineSearch()
    );
  });

  it("uses a bounded concurrent pool and keeps page order", async () => {
    let active = 0;
    let maxActive = 0;
    const engine = {
      getPageCount: () => 10,
      getTextContent: async (pageIndex: number) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, pageIndex % 2));
        active -= 1;
        return [item(pageIndex === 2 || pageIndex === 8 ? "Casa" : "nada")];
      },
    } as unknown as DocumentEngine;

    const results = await new SearchService(engine).search("casa");
    expect(maxActive).toBeGreaterThan(1);
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(results.map((result) => result.pageIndex)).toEqual([2, 8]);
  });

  it("reuses extracted page text in the same service", async () => {
    let calls = 0;
    const engine = {
      getPageCount: () => 3,
      getTextContent: async () => {
        calls += 1;
        return [item("casa")];
      },
    } as unknown as DocumentEngine;
    const service = new SearchService(engine);

    await service.search("casa");
    await service.search("CASA");
    expect(calls).toBe(3);
  });

  it("can invalidate the page cache when the document changes", async () => {
    let calls = 0;
    const engine = {
      getPageCount: () => 1,
      getTextContent: async () => {
        calls += 1;
        return [item(calls === 1 ? "casa" : "casamento")];
      },
    } as unknown as DocumentEngine;
    const service = new SearchService(engine);

    await expect(service.search("casa")).resolves.toHaveLength(1);
    service.clearCache();
    await expect(service.search("casamento")).resolves.toHaveLength(1);
    expect(calls).toBe(2);
  });

  it("keeps a single unreadable page from aborting the whole fallback search", async () => {
    const engine = {
      getPageCount: () => 3,
      getTextContent: async (pageIndex: number) => {
        if (pageIndex === 1) throw new Error("unreadable page");
        return [item(pageIndex === 2 ? "casa" : "nada")];
      },
    } as unknown as DocumentEngine;

    await expect(new SearchService(engine).search("casa")).resolves.toEqual([
      { pageIndex: 2, text: "casa", matchIndex: 0 },
    ]);
  });

  it("keeps a large fallback document within the same concurrency bound", async () => {
    let active = 0;
    let maxActive = 0;
    const engine = {
      getPageCount: () => 128,
      getTextContent: async (pageIndex: number) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, pageIndex % 3));
        active -= 1;
        return [item(pageIndex === 127 ? "final" : "other")];
      },
    } as unknown as DocumentEngine;

    await expect(new SearchService(engine).search("final")).resolves.toEqual([
      { pageIndex: 127, text: "final", matchIndex: 0 },
    ]);
    expect(maxActive).toBeLessThanOrEqual(4);
  });

  it("does not expose an older concurrent request as the current result", async () => {
    const first = deferred<TextItem[]>();
    const engine = {
      getPageCount: () => 1,
      getTextContent: () => first.promise,
    } as unknown as DocumentEngine;
    const service = new SearchService(engine);

    const oldSearch = service.search("casa");
    const newSearch = service.search("casamento");
    first.resolve([item("casa casamento")]);

    await expect(newSearch).resolves.toHaveLength(1);
    await expect(oldSearch).resolves.toEqual([]);
  });
});
