export type SearchSnippetPart = { text: string; match: boolean };

/** Splits a result snippet around case-insensitive matches of the query. */
/**
 * Lowercase without accents, one UTF-16 unit at a time so indexes still
 * point into the original text ("publico" highlights "público", as the
 * search itself ignores accents).
 */
const foldForMatch = (value: string) => {
  let folded = "";
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
    folded += next.length === 1 ? next : char;
  }
  return folded;
};

export function splitSearchSnippet(text: string, query: string): SearchSnippetPart[] {
  const needle = foldForMatch(query.trim());
  if (!text) return [];
  if (!needle) return [{ text, match: false }];
  const haystack = foldForMatch(text);
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
