import { DocumentEngine, SearchResult } from "@papyrus-sdk/types";

export class SearchService {
  private engine: DocumentEngine;
  constructor(engine: DocumentEngine) {
    this.engine = engine;
  }

  async search(query: string): Promise<SearchResult[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) return [];
    const normalizedQuery = this.normalizeForSearch(trimmedQuery);
    if (!normalizedQuery) return [];

    if (typeof this.engine.searchText === "function") {
      return await this.engine.searchText(trimmedQuery);
    }

    const results: SearchResult[] = [];
    const pageCount = this.engine.getPageCount();

    for (let i = 0; i < pageCount; i++) {
      const textContent = await this.engine.getTextContent(i);
      const rawPageText = textContent.map((item) => item.str).join(" ");
      const cleanPageText = this.normalizeWhitespace(
        this.decodeHtmlEntities(this.stripMarkup(rawPageText))
      );
      if (!cleanPageText) continue;

      const { normalized, map } = this.normalizeWithMap(cleanPageText);
      if (!normalized) continue;

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
          pageIndex: i,
          text: cleanPageText.substring(start, end),
          matchIndex: matchIndex++,
        });
        pos = normalized.indexOf(normalizedQuery, pos + 1);
      }
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
