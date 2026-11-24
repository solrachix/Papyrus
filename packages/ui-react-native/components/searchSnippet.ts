export type SearchSnippetPart = { text: string; match: boolean };

/** Splits a result snippet around case-insensitive matches of the query. */
export function splitSearchSnippet(text: string, query: string): SearchSnippetPart[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!text) return [];
  if (!needle) return [{ text, match: false }];
  const haystack = text.toLocaleLowerCase();
  const parts: SearchSnippetPart[] = [];
  let cursor = 0;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

/** Collapses whitespace from the extracted chapter text. */
export const normalizeSearchSnippet = (text: string) => text.replace(/\s+/g, " ").trim();
