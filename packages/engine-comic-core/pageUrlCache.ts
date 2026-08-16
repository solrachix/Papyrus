export const DEFAULT_COMIC_PAGE_CACHE_SIZE = 12;
export const DEFAULT_COMIC_THUMBNAIL_CACHE_SIZE = 4;

type RevokeObjectUrl = (url: string) => void;

type PageUrlEntry = {
  url: string;
  lastUsed: number;
};

const revokeBrowserObjectUrl: RevokeObjectUrl = (url) => {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
};

export class ComicPageUrlCache {
  private readonly maxEntries: number;
  private readonly revokeObjectUrl: RevokeObjectUrl;
  private readonly entries = new Map<number, PageUrlEntry>();
  private usageClock = 0;

  constructor(
    maxEntries = DEFAULT_COMIC_PAGE_CACHE_SIZE,
    revokeObjectUrl: RevokeObjectUrl = revokeBrowserObjectUrl
  ) {
    const normalizedMaxEntries = Number.isFinite(maxEntries)
      ? Math.floor(maxEntries)
      : DEFAULT_COMIC_PAGE_CACHE_SIZE;
    this.maxEntries = Math.max(2, normalizedMaxEntries);
    this.revokeObjectUrl = revokeObjectUrl;
  }

  get size(): number {
    return this.entries.size;
  }

  get(pageIndex: number): string | undefined {
    const entry = this.entries.get(pageIndex);
    if (!entry) return undefined;
    entry.lastUsed = ++this.usageClock;
    return entry.url;
  }

  set(pageIndex: number, url: string, protectedPageIndex?: number): void {
    const previous = this.entries.get(pageIndex);
    if (previous && previous.url !== url) {
      this.revokeObjectUrl(previous.url);
    }

    this.entries.set(pageIndex, {
      url,
      lastUsed: ++this.usageClock,
    });
    this.evict(protectedPageIndex);
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.revokeObjectUrl(entry.url);
    }
    this.entries.clear();
    this.usageClock = 0;
  }

  private evict(protectedPageIndex?: number): void {
    while (this.entries.size > this.maxEntries) {
      let oldestPageIndex: number | undefined;
      let oldestLastUsed = Number.POSITIVE_INFINITY;

      for (const [pageIndex, entry] of this.entries) {
        if (pageIndex === protectedPageIndex) continue;
        if (entry.lastUsed < oldestLastUsed) {
          oldestPageIndex = pageIndex;
          oldestLastUsed = entry.lastUsed;
        }
      }

      if (oldestPageIndex === undefined) return;
      const entry = this.entries.get(oldestPageIndex);
      this.entries.delete(oldestPageIndex);
      if (entry) this.revokeObjectUrl(entry.url);
    }
  }
}
