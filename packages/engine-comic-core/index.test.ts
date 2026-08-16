import { describe, expect, it } from "vitest";

import { ComicEngine, type ComicArchive } from "./index";
import type { ComicArchiveEntry } from "./archiveEntries";

const entry = (name: string): ComicArchiveEntry => ({
  name,
  size: 1,
  read: async () => new Blob(),
});

class TestComicEngine extends ComicEngine {
  archive: ComicArchive | null = null;

  protected async openArchive(): Promise<ComicArchive> {
    this.archive = {
      entries: [entry("page-10.jpg"), entry("page-2.png"), entry("notes.txt")],
    };
    return this.archive;
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
    let disposed = false;
    const engine = new TestComicEngine();
    engine.openArchive = async () => ({
      entries: [entry("page.jpg")],
      dispose: () => {
        disposed = true;
      },
    });

    await engine.load("comic.cbz");
    engine.destroy();

    expect(disposed).toBe(true);
    expect(engine.getPageCount()).toBe(0);
  });
});
