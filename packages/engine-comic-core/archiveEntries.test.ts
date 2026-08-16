import { describe, expect, it } from "vitest";

import {
  filterAndSortComicEntries,
  type ComicArchiveEntry,
} from "./archiveEntries";

const entry = (name: string): ComicArchiveEntry => ({
  name,
  size: 1,
  read: async () => new Blob(),
});

describe("filterAndSortComicEntries", () => {
  it("keeps image pages and sorts numeric filenames naturally", () => {
    const result = filterAndSortComicEntries([
      entry("page-10.jpg"),
      entry("ComicInfo.xml"),
      entry("page-2.png"),
      entry("cover.webp"),
      entry("notes.txt"),
    ]);

    expect(result.map(({ name }) => name)).toEqual([
      "cover.webp",
      "page-2.png",
      "page-10.jpg",
    ]);
  });

  it("rejects hidden files and unsupported image extensions", () => {
    const result = filterAndSortComicEntries([
      entry(".DS_Store"),
      entry("page.bmp"),
      entry("page.jpeg"),
      entry("folder/page.gif"),
    ]);

    expect(result.map(({ name }) => name)).toEqual([
      "folder/page.gif",
      "page.jpeg",
    ]);
  });
});
