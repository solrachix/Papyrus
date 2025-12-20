
import { DocumentEngine, SearchResult } from '../../types/index';

export class SearchService {
  private engine: DocumentEngine;
  constructor(engine: DocumentEngine) { this.engine = engine; }

  async search(query: string): Promise<SearchResult[]> {
    if (!query || query.length < 2) return [];
    const results: SearchResult[] = [];
    const pageCount = this.engine.getPageCount();
    const normalizedQuery = query.toLowerCase();

    for (let i = 0; i < pageCount; i++) {
      const textContent = await this.engine.getTextContent(i);
      const fullPageText = textContent.map(item => item.str).join(' ');
      let pos = fullPageText.toLowerCase().indexOf(normalizedQuery, 0);
      let matchIndex = 0;
      while (pos !== -1) {
        const start = Math.max(0, pos - 20);
        const end = Math.min(fullPageText.length, pos + query.length + 20);
        results.push({ pageIndex: i, text: fullPageText.substring(start, end), matchIndex: matchIndex++ });
        pos = fullPageText.toLowerCase().indexOf(normalizedQuery, pos + 1);
      }
    }
    return results;
  }
}
