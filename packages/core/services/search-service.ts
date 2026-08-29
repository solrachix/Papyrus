import { DocumentEngine, SearchResult, TextItem } from "@papyrus-sdk/types";

const FALLBACK_SEARCH_CONCURRENCY = 4;

export class SearchService {
  private engine: DocumentEngine;
  private pageTextCache = new Map<number, Promise<TextItem[]>>();
  private cachedPageCount: number | null = null;
  private requestGeneration = 0;

  constructor(engine: DocumentEngine) {
    this.engine = engine;
  }

  clearCache() {
    this.pageTextCache.clear();
    this.cachedPageCount = null;
  }

  async search(query: string): Promise<SearchResult[]> {
    const requestGeneration = ++this.requestGeneration;
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) return [];
    const normalizedQuery = this.normalizeForSearch(trimmedQuery);
    if (!normalizedQuery) return [];

    if (typeof this.engine.searchText === "function") {
      const results = await this.engine.searchText(trimmedQuery);
      return requestGeneration === this.requestGeneration ? results : [];
    }

    const pageCount = this.engine.getPageCount();
    if (this.cachedPageCount !== null && this.cachedPageCount !== pageCount) {
      this.clearCache();
    }
    this.cachedPageCount = pageCount;

    const pageResults: SearchResult[][] = Array.from(
      { length: pageCount },
      () => []
    );
    let nextPageIndex = 0;

    const worker = async () => {
      while (true) {
        const pageIndex = nextPageIndex++;
        if (pageIndex >= pageCount) return;
        pageResults[pageIndex] = await this.searchPage(
          pageIndex,
          normalizedQuery,
          trimmedQuery
        );
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(FALLBACK_SEARCH_CONCURRENCY, pageCount) },
        () => worker()
      )
    );

    if (requestGeneration !== this.requestGeneration) return [];
    return pageResults.flat();
  }

  private async searchPage(
    pageIndex: number,
    normalizedQuery: string,
    trimmedQuery: string
  ): Promise<SearchResult[]> {
    let textPromise = this.pageTextCache.get(pageIndex);
    if (!textPromise) {
      textPromise = this.engine.getTextContent(pageIndex).catch((error) => {
        this.pageTextCache.delete(pageIndex);
        throw error;
      });
      this.pageTextCache.set(pageIndex, textPromise);
    }

    let textContent: TextItem[];
    try {
      textContent = await textPromise;
    } catch {
      return [];
    }
    const rawPageText = textContent.map((item) => item.str).join(" ");
    const cleanPageText = this.normalizeWhitespace(
      this.decodeHtmlEntities(this.stripMarkup(rawPageText))
    );
    if (!cleanPageText) return [];

    const { normalized, map } = this.normalizeWithMap(cleanPageText);
    if (!normalized) return [];

    const results: SearchResult[] = [];
    let pos = normalized.indexOf(normalizedQuery, 0);
    let matchIndex = 0;
    while (pos !== -1) {
      const anchor = map[pos] ?? pos;
      const start = Math.max(0, anchor - 40);
      const end = Math.min(
        cleanPageText.length,
        anchor + trimmedQuery.length + 40
      );
      results.push({
        pageIndex,
        text: cleanPageText.substring(start, end),
        matchIndex: matchIndex++,
      });
      pos = normalized.indexOf(normalizedQuery, pos + 1);
    }
    return results;
  }

  private normalizeForSearch(value: string): string {
    return value
      .toLocaleLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  private normalizeWithMap(value: string): {
    normalized: string;
    map: number[];
  } {
    let normalized = "";
    const map: number[] = [];

    for (let i = 0; i < value.length; i += 1) {
      const next = this.normalizeForSearch(value[i]);
      if (!next) continue;
      normalized += next;
      for (let j = 0; j < next.length; j += 1) {
        map.push(i);
      }
    }

    return { normalized, map };
  }

  private stripMarkup(value: string): string {
    if (!value) return "";
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
  }

  private decodeHtmlEntities(value: string): string {
    if (!value) return "";
    if (typeof document === "undefined") return value;

    const textArea = document.createElement("textarea");
    textArea.innerHTML = value;
    return textArea.value;
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }
}
