import { describe, expect, it } from "vitest";
import {
  filterAndSortNativeComicEntries,
  logicalToVisualComicIndex,
  NativeComicLruCache,
} from "./nativeComicModel";

const entry = (name: string, size = 1) => ({ name, size });

describe("native comic model", () => {
  it("filters metadata and image types the platform cannot display and sorts naturally", () => {
    const pages = filterAndSortNativeComicEntries([
      entry("page-10.jpg"), entry("page-2.png"), entry("cover.webp"),
      entry(".DS_Store"), entry("__MACOSX/._cover.jpg"),
      entry("notes.txt"), entry("large.jpg", 65 * 1024 * 1024),
    ], false);
    expect(pages.map((page) => page.name)).toEqual(["page-2.png", "page-10.jpg"]);
    expect(filterAndSortNativeComicEntries([entry("cover.webp")], true)).toHaveLength(1);
  });

  it("maps RTL visual order without changing the logical page index", () => {
    expect(logicalToVisualComicIndex(0, 5, "ltr")).toBe(0);
    expect(logicalToVisualComicIndex(0, 5, "rtl")).toBe(4);
    expect(logicalToVisualComicIndex(5, 5, "rtl")).toBe(0);
    expect(logicalToVisualComicIndex(0, 0, "rtl")).toBe(0);
  });

  it("keeps decoded page data within the byte budget with LRU eviction", () => {
    const cache = new NativeComicLruCache<string>(10);
    cache.set(0, "page-0", 5);
    cache.set(1, "page-1", 5);
    expect(cache.get(0)).toBe("page-0");
    cache.set(2, "page-2", 5);
    expect(cache.get(0)).toBe("page-0");
    expect(cache.get(1)).toBeUndefined();
    expect(cache.sizeBytes).toBe(10);
  });
});
