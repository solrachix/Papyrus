type OutlineNode = {title?: string | null; pageIndex?: number | null; children?: OutlineNode[] | null};

/**
 * The table-of-contents entry the reader is in. EPUB "pages" are files
 * (cover, title page, dedication…), so the file index is not the chapter the
 * reader sees: chapter 11 can be the 21st file.
 */
export function resolveEpubChapterTitle(outline: readonly OutlineNode[] | null | undefined, spineIndex: number) {
  if (!Array.isArray(outline) || !Number.isInteger(spineIndex) || spineIndex < 0) return null;
  const entries: Array<{index: number; title: string}> = [];
  const visit = (nodes: readonly OutlineNode[]) => {
    for (const node of nodes) {
      const index = Number(node?.pageIndex);
      const title = String(node?.title ?? '').replace(/\s+/g, ' ').trim();
      if (title && Number.isInteger(index) && index >= 0) entries.push({index, title});
      if (Array.isArray(node?.children)) visit(node.children);
    }
  };
  visit(outline);
  const index = entries.reduce((best, entry) => (entry.index <= spineIndex && entry.index > best ? entry.index : best), -1);
  if (index < 0) return null;
  const inFile = entries.filter(entry => entry.index === index);
  // A part heading and its first chapter can share a file (take the chapter).
  // More entries than that means several chapters in one file: without the
  // position inside it the chapter is unknown, and no name beats a wrong one.
  return inFile.length > 2 ? null : inFile[inFile.length - 1].title;
}

export const shortenEpubChapterTitle = (title: string, max = 14) =>
  title.length > max ? `${title.slice(0, max - 1).trimEnd()}…` : title;
