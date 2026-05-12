import {
  resolveAnchoredDocumentOffset,
  resolveAnchoredHorizontalSurfaceOffset,
  resolveAnchoredViewportOffset,
  resolveCenteredContentInset,
  resolveDocumentSurfaceWidth,
  resolveGlobalHorizontalOffset,
} from "../gesture/pinchZoom";

export type PdfVerticalAnchorMode = "page" | "document";

export type PdfVerticalAnchorInput = {
  focalY: number;
  startScrollY: number;
  startPageOffsetY: number;
  startPageHeight: number;
};

export type PdfResolveScrollYInput = {
  mode: PdfVerticalAnchorMode;
  focalY: number;
  startScrollY: number;
  startPageOffsetY: number;
  startPageHeight: number;
  startContentHeight: number;
  endPageOffsetY: number;
  endPageHeight: number;
  endContentHeight: number;
  viewportHeight: number;
};

export type PdfResolveScrollXInput = {
  focalViewportX: number;
  startSurfaceScrollX: number;
  startSurfaceWidth: number;
  endSurfaceWidth: number;
  viewportWidth: number;
};

export type PdfSurfaceWidthInput = {
  viewportWidth: number;
  contentWidth: number;
  horizontalPadding: number;
};

export type PdfCenteredInsetInput = {
  viewportLength: number;
  contentLength: number;
};

export const resolvePdfVerticalAnchorMode = ({
  focalY,
  startScrollY,
  startPageOffsetY,
  startPageHeight,
}: PdfVerticalAnchorInput): PdfVerticalAnchorMode => {
  const contentY =
    (Number.isFinite(startScrollY) ? startScrollY : 0) +
    (Number.isFinite(focalY) ? focalY : 0);
  const pageTop = Number.isFinite(startPageOffsetY) ? startPageOffsetY : 0;
  const pageHeight =
    Number.isFinite(startPageHeight) && startPageHeight > 0
      ? startPageHeight
      : 0;
  return contentY >= pageTop && contentY <= pageTop + pageHeight
    ? "page"
    : "document";
};

export const resolvePdfAnchoredScrollY = ({
  mode,
  focalY,
  startScrollY,
  startPageOffsetY,
  startPageHeight,
  startContentHeight,
  endPageOffsetY,
  endPageHeight,
  endContentHeight,
  viewportHeight,
}: PdfResolveScrollYInput): number => {
  if (mode === "page") {
    return resolveAnchoredViewportOffset({
      viewportOffset: focalY,
      startScrollOffset: startScrollY,
      startItemOffset: startPageOffsetY,
      startItemLength: startPageHeight,
      endItemOffset: endPageOffsetY,
      endItemLength: endPageHeight,
      viewportLength: viewportHeight,
      endContentLength: endContentHeight,
    });
  }

  return resolveAnchoredDocumentOffset({
    viewportOffset: focalY,
    startScrollOffset: startScrollY,
    startContentLength: startContentHeight,
    endContentLength: endContentHeight,
    viewportLength: viewportHeight,
  });
};

export const resolvePdfAnchoredScrollX = (
  input: PdfResolveScrollXInput
): number => resolveAnchoredHorizontalSurfaceOffset(input);

export const resolvePdfSurfaceWidth = (input: PdfSurfaceWidthInput): number =>
  resolveDocumentSurfaceWidth(input);

export const resolvePdfGlobalScrollX = ({
  startSurfaceScrollX,
  endSurfaceWidth,
  viewportWidth,
}: PdfResolveScrollXInput): number =>
  resolveGlobalHorizontalOffset({
    offsetX: startSurfaceScrollX,
    surfaceWidth: endSurfaceWidth,
    viewportWidth,
  });

export const resolvePdfCenteredInset = (input: PdfCenteredInsetInput): number =>
  resolveCenteredContentInset(input);
