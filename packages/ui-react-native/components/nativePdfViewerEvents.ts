export type NativePdfVisiblePage = {
  pageIndex: number;
  visibleRatio: number;
};

export type NativePdfTextSelection = {
  text: string;
  pageIndex: number;
  rects: { x: number; y: number; width: number; height: number }[];
};

export const resolveNativePdfTextSelection = (
  selection:
    | Partial<NativePdfTextSelection>
    | null
    | undefined
): NativePdfTextSelection | null => {
  if (
    typeof selection?.text !== "string" ||
    !selection.text.trim() ||
    !Number.isInteger(selection.pageIndex) ||
    (selection.pageIndex ?? -1) < 0
  ) {
    return null;
  }

  const rects = (selection.rects ?? []).flatMap((rect) => {
    if (
      !rect ||
      !Number.isFinite(rect.x) ||
      !Number.isFinite(rect.y) ||
      !Number.isFinite(rect.width) ||
      !Number.isFinite(rect.height) ||
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return [];
    }

    const x = Math.max(0, Math.min(1, rect.x));
    const y = Math.max(0, Math.min(1, rect.y));
    const right = Math.max(0, Math.min(1, rect.x + rect.width));
    const bottom = Math.max(0, Math.min(1, rect.y + rect.height));
    if (right <= x || bottom <= y) return [];
    return [
      {
        x,
        y,
        width:
          rect.x < 0 || rect.x + rect.width > 1
            ? right - x
            : rect.width,
        height:
          rect.y < 0 || rect.y + rect.height > 1
            ? bottom - y
            : rect.height,
      },
    ];
  });

  return {
    text: selection.text,
    pageIndex: selection.pageIndex as number,
    rects,
  };
};

export const resolveNativePdfPageChange = (
  page: number,
  pageCount: number
): { currentPage: number } | null => {
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return null;
  return { currentPage: page };
};

export const resolveNativePdfZoomChange = (
  zoom: number
): { zoom: number } | null => {
  if (!Number.isFinite(zoom)) return null;
  return { zoom: Math.max(0.5, Math.min(4, zoom)) };
};

export const resolveNativePdfVisiblePages = (
  pages: readonly Partial<NativePdfVisiblePage>[] | null | undefined
): NativePdfVisiblePage[] =>
  (pages ?? []).flatMap((page) => {
    if (
      !Number.isInteger(page.pageIndex) ||
      (page.pageIndex ?? -1) < 0 ||
      typeof page.visibleRatio !== "number" ||
      !Number.isFinite(page.visibleRatio) ||
      page.visibleRatio <= 0
    ) {
      return [];
    }

    return [
      {
        pageIndex: page.pageIndex as number,
        visibleRatio: Math.min(1, page.visibleRatio),
      },
    ];
  });
