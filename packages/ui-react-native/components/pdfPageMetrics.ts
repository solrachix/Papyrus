export type PdfBasePageWidthInput = {
  viewportWidth: number;
  horizontalPadding: number;
  maxPageWidth?: number;
  maxPageHeight?: number;
  pageAspectRatio?: number;
};

export const resolvePdfDoublePageContentWidth = ({
  currentPage,
  pageCount,
  columnGap,
  getPageWidthForZoom,
}: {
  currentPage: number;
  pageCount: number;
  columnGap: number;
  getPageWidthForZoom: (pageIndex: number) => number;
}) => {
  const safePageCount = Number.isFinite(pageCount) ? Math.trunc(pageCount) : 0;
  if (safePageCount <= 0) return 0;

  const safeCurrentPage = Number.isFinite(currentPage)
    ? Math.trunc(currentPage)
    : 1;
  const pageIndex = Math.max(
    0,
    Math.min(safePageCount - 1, safeCurrentPage - 1)
  );
  const leftPageIndex = Math.floor(pageIndex / 2) * 2;
  const rightPageIndex = leftPageIndex + 1;
  const resolvePageWidth = (index: number) => {
    const width = getPageWidthForZoom(index);
    return Number.isFinite(width) && width > 0 ? width : 0;
  };
  const leftPageWidth = resolvePageWidth(leftPageIndex);
  const rightPageWidth =
    rightPageIndex < safePageCount
      ? resolvePageWidth(rightPageIndex)
      : leftPageWidth;
  const safeColumnGap =
    Number.isFinite(columnGap) && columnGap > 0 ? columnGap : 0;

  return leftPageWidth + rightPageWidth + safeColumnGap;
};

export const resolveMaxPageWidth = (maxPageWidth?: number) =>
  typeof maxPageWidth === "number" &&
  Number.isFinite(maxPageWidth) &&
  maxPageWidth > 0
    ? maxPageWidth
    : undefined;

export const resolvePdfFitPageHeight = (
  viewportHeight: number,
  verticalInset: number
) => {
  if (
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !Number.isFinite(verticalInset) ||
    verticalInset < 0
  ) {
    return undefined;
  }

  return Math.max(1, viewportHeight - verticalInset * 2);
};

export const resolvePdfBasePageWidth = ({
  viewportWidth,
  horizontalPadding,
  maxPageWidth,
  maxPageHeight,
  pageAspectRatio,
}: PdfBasePageWidthInput) => {
  const availablePageWidth = Math.max(
    0,
    viewportWidth - horizontalPadding * 2
  );
  const resolvedMaxPageWidth = resolveMaxPageWidth(maxPageWidth);
  const hasValidPageHeight =
    typeof maxPageHeight === "number" &&
    Number.isFinite(maxPageHeight) &&
    maxPageHeight > 0 &&
    typeof pageAspectRatio === "number" &&
    Number.isFinite(pageAspectRatio) &&
    pageAspectRatio > 0;
  const widthForMaxHeight = hasValidPageHeight
    ? maxPageHeight * pageAspectRatio
    : Number.POSITIVE_INFINITY;

  return Math.min(
    availablePageWidth,
    resolvedMaxPageWidth ?? Number.POSITIVE_INFINITY,
    widthForMaxHeight
  );
};
