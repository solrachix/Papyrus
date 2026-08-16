import { describe, expect, it } from "vitest";

import { ComicPageUrlCache } from "./pageUrlCache";

describe("ComicPageUrlCache", () => {
  it("evicts the least recently used page without evicting the active page", () => {
    const revoked: string[] = [];
    const cache = new ComicPageUrlCache(2, (url) => revoked.push(url));

    cache.set(0, "blob:page-0", 2);
    cache.set(1, "blob:page-1", 2);
    expect(cache.get(0)).toBe("blob:page-0");

    cache.set(2, "blob:page-2", 2);

    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(0)).toBe("blob:page-0");
    expect(cache.get(2)).toBe("blob:page-2");
    expect(revoked).toEqual(["blob:page-1"]);
    expect(cache.size).toBe(2);
  });

  it("revokes all remaining URLs when cleared", () => {
    const revoked: string[] = [];
    const cache = new ComicPageUrlCache(2, (url) => revoked.push(url));

    cache.set(0, "blob:page-0");
    cache.set(1, "blob:page-1");
    cache.clear();

    expect(revoked).toEqual(["blob:page-0", "blob:page-1"]);
    expect(cache.size).toBe(0);
  });
});
