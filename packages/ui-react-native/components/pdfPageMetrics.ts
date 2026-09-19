export type PdfBasePageWidthInput = {
  viewportWidth: number;
  horizontalPadding: number;
  maxPageWidth?: number;
};

export const resolveMaxPageWidth = (maxPageWidth?: number) =>
  typeof maxPageWidth === "number" &&
  Number.isFinite(maxPageWidth) &&
  maxPageWidth > 0
    ? maxPageWidth
    : undefined;

export const resolvePdfBasePageWidth = ({
  viewportWidth,
  horizontalPadding,
  maxPageWidth,
}: PdfBasePageWidthInput) => {
  const availablePageWidth = Math.max(
    0,
    viewportWidth - horizontalPadding * 2
  );
  const resolvedMaxPageWidth = resolveMaxPageWidth(maxPageWidth);
  return resolvedMaxPageWidth === undefined
    ? availablePageWidth
    : Math.min(availablePageWidth, resolvedMaxPageWidth);
};
