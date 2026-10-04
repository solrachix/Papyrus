export type NativePdfVisiblePage = {
  pageIndex: number;
  visibleRatio: number;
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
