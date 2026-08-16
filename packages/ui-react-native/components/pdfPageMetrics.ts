export type PdfBasePageWidthInput = {
  viewportWidth: number;
  horizontalPadding: number;
};

export const resolvePdfBasePageWidth = ({
  viewportWidth,
  horizontalPadding,
}: PdfBasePageWidthInput) =>
  Math.max(0, viewportWidth - horizontalPadding * 2);
