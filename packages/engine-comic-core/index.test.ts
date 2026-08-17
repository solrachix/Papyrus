import { describe, expect, it, vi } from "vitest";

import { ComicEngine, type ComicArchive } from "./index";
import type { ComicArchiveEntry } from "./archiveEntries";

const entry = (name: string): ComicArchiveEntry => ({
  name,
  size: 1,
  read: async () => new Blob(),
});

class TestComicEngine extends ComicEngine {
  protected async openArchive(): Promise<ComicArchive> {
    return {
      entries: [entry("page-10.jpg"), entry("page-2.png"), entry("notes.txt")],
    };
  }
}

class DisposableComicEngine extends ComicEngine {
  disposed = false;

  protected async openArchive(): Promise<ComicArchive> {
    return {
      entries: [entry("page.jpg")],
      dispose: () => {
        this.disposed = true;
      },
    };
  }
}

class CacheTestComicEngine extends ComicEngine {
  protected async openArchive(): Promise<ComicArchive> {
    return {
      entries: [entry("page-1.jpg"), entry("page-2.jpg"), entry("page-3.jpg")],
    };
  }
}

describe("ComicEngine", () => {
  it("loads only image entries as naturally ordered pages", async () => {
    const engine = new TestComicEngine();

    await engine.load({ type: "comic", source: "comic.cbz" });

    expect(engine.getPageCount()).toBe(2);
    expect(engine.getCurrentPage()).toBe(1);
    expect(await engine.getPageIndex({ kind: "pageNumber", value: 2 })).toBe(1);
    expect(await engine.getTextContent(0)).toEqual([]);
    expect(await engine.getOutline()).toEqual([]);
  });

  it("rejects a document request for another engine type", async () => {
    const engine = new TestComicEngine();

    await expect(
      engine.load({ type: "pdf", source: "comic.cbz" })
    ).rejects.toThrow("Tipo de documento não suportado");
  });

  it("disposes the active archive when destroyed", async () => {
    const engine = new DisposableComicEngine();

    await engine.load("comic.cbz");
    engine.destroy();

    expect(engine.disposed).toBe(true);
    expect(engine.getPageCount()).toBe(0);
  });

  it("does not let thumbnail rendering revoke a viewer page URL", async () => {
    let nextUrl = 0;
    const revoked: string[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => `blob:page-${nextUrl++}`),
      revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
    });

    const engine = new CacheTestComicEngine({ maxCachedPages: 2 });
    await engine.load("comic.cbz");

    const viewerTarget = document.createElement("div");
    await engine.renderPage(0, viewerTarget);
    await engine.renderPage(1, viewerTarget);
    const viewerPageUrl = viewerTarget.querySelector("img")?.src;

    const thumbnailTarget = document.createElement("div");
    thumbnailTarget.dataset.papyrusRenderTarget = "thumbnail";
    await engine.renderPage(2, thumbnailTarget);
    await engine.renderPage(1, thumbnailTarget);

    expect(revoked).not.toContain(viewerPageUrl);
    engine.destroy();
    vi.unstubAllGlobals();
  });
});
