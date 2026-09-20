export type PdfBasePageWidthInput = {
  viewportWidth: number;
  horizontalPadding: number;
  maxPageWidth?: number;
  maxPageHeight?: number;
  pageAspectRatio?: number;
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
