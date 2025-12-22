
import { DocumentEngine, SearchResult } from '../types';

export class SearchService {
  private engine: DocumentEngine;

  constructor(engine: DocumentEngine) {
    this.engine = engine;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!query || query.length < 2) return [];
    if (typeof this.engine.searchText === 'function') {
      return await this.engine.searchText(query);
    }
    
    const results: SearchResult[] = [];
    const pageCount = this.engine.getPageCount();
    const normalizedQuery = query.toLowerCase();

    for (let i = 0; i < pageCount; i++) {
      const textContent = await this.engine.getTextContent(i);
      const fullPageText = textContent.map(item => item.str).join(' ');
      
      let matchIndex = 0;
      let pos = fullPageText.toLowerCase().indexOf(normalizedQuery, 0);
      
      while (pos !== -1) {
        // Extract a preview snippet
        const start = Math.max(0, pos - 20);
        const end = Math.min(fullPageText.length, pos + query.length + 20);
        const previewText = fullPageText.substring(start, end);

        results.push({
          pageIndex: i,
          text: previewText,
          matchIndex: matchIndex
        });
        
        matchIndex++;
        pos = fullPageText.toLowerCase().indexOf(normalizedQuery, pos + 1);
      }
    }

    return results;
  }
}
