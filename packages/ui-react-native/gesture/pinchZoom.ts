export type PinchTouchPoint = {
  pageX: number;
  pageY: number;
};

export type PinchSession = {
  initialDistance: number;
  initialZoom: number;
};

export type PinchZoomBounds = {
  minZoom: number;
  maxZoom: number;
};

export type AnchoredViewportOffsetInput = {
  viewportOffset: number;
  startScrollOffset: number;
  startItemOffset: number;
  startItemLength: number;
  endItemOffset: number;
  endItemLength: number;
  viewportLength: number;
  endContentLength: number;
};

export type DocumentSurfaceWidthInput = {
  viewportWidth: number;
  contentWidth: number;
  horizontalPadding: number;
};

export type GlobalHorizontalOffsetInput = {
  offsetX: number;
  surfaceWidth: number;
  viewportWidth: number;
};

export const DEFAULT_PINCH_ZOOM_BOUNDS: PinchZoomBounds = {
  minZoom: 0.5,
  maxZoom: 4,
};
export const PINCH_PRESS_SUPPRESSION_MS = 120;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const getTouchDistance = (touches: PinchTouchPoint[]): number => {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
};

export const isPinchTouchList = (touches: PinchTouchPoint[]): boolean =>
  touches.length === 2 && getTouchDistance(touches) > 0;

export const createPinchSession = (
  touches: PinchTouchPoint[],
  zoom: number,
  bounds: PinchZoomBounds = DEFAULT_PINCH_ZOOM_BOUNDS
): PinchSession => ({
  initialDistance: Math.max(1, getTouchDistance(touches)),
  initialZoom: clamp(zoom, bounds.minZoom, bounds.maxZoom),
});

export const resolvePinchZoomChange = (
  session: PinchSession,
  touches: PinchTouchPoint[],
  bounds: PinchZoomBounds = DEFAULT_PINCH_ZOOM_BOUNDS
): number => {
  const distance = getTouchDistance(touches);
  if (distance <= 0) {
    return clamp(session.initialZoom, bounds.minZoom, bounds.maxZoom);
  }

  return clamp(
    session.initialZoom * (distance / session.initialDistance),
    bounds.minZoom,
    bounds.maxZoom
  );
};

export const resolvePinchPreviewScale = (
  startZoom: number,
  previewZoom: number
): number => {
  const safeStartZoom = Math.max(0.0001, Math.abs(startZoom));
  return previewZoom / safeStartZoom;
};

export const sanitizePinchPreviewScale = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return value;
};

export const resolvePinchGestureZoom = (
  startZoom: number,
  scaleFactor: number,
  bounds: PinchZoomBounds = DEFAULT_PINCH_ZOOM_BOUNDS
): number =>
  clamp(
    (Number.isFinite(startZoom) && startZoom > 0 ? startZoom : 1) *
      (Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1),
    bounds.minZoom,
    bounds.maxZoom
  );

export const resolveAnchoredViewportOffset = ({
  viewportOffset,
  startScrollOffset,
  startItemOffset,
  startItemLength,
  endItemOffset,
  endItemLength,
  viewportLength,
  endContentLength,
}: AnchoredViewportOffsetInput): number => {
  const safeViewportOffset = Number.isFinite(viewportOffset)
    ? viewportOffset
    : 0;
  const safeStartScrollOffset = Number.isFinite(startScrollOffset)
    ? startScrollOffset
    : 0;
  const safeStartItemOffset = Number.isFinite(startItemOffset)
    ? startItemOffset
    : 0;
  const safeStartItemLength =
    Number.isFinite(startItemLength) && startItemLength > 0
      ? startItemLength
      : 1;
  const safeEndItemOffset = Number.isFinite(endItemOffset) ? endItemOffset : 0;
  const safeEndItemLength =
    Number.isFinite(endItemLength) && endItemLength > 0 ? endItemLength : 1;
  const safeViewportLength =
    Number.isFinite(viewportLength) && viewportLength > 0 ? viewportLength : 0;
  const safeEndContentLength =
    Number.isFinite(endContentLength) && endContentLength > 0
      ? endContentLength
      : safeEndItemOffset + safeEndItemLength;

  const contentPoint =
    safeStartScrollOffset + safeViewportOffset - safeStartItemOffset;
  const normalizedPoint = clamp(contentPoint / safeStartItemLength, 0, 1);
  const anchoredContentPoint =
    safeEndItemOffset + normalizedPoint * safeEndItemLength;
  return clamp(
    anchoredContentPoint - safeViewportOffset,
    0,
    Math.max(0, safeEndContentLength - safeViewportLength)
  );
};

export const resolveClampedScrollOffset = (
  offset: number,
  contentLength: number,
  viewportLength: number
): number => {
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const safeContentLength =
    Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;
  const safeViewportLength =
    Number.isFinite(viewportLength) && viewportLength > 0 ? viewportLength : 0;
  return clamp(
    safeOffset,
    0,
    Math.max(0, safeContentLength - safeViewportLength)
  );
};

export const resolveDocumentSurfaceWidth = ({
  viewportWidth,
  contentWidth,
  horizontalPadding,
}: DocumentSurfaceWidthInput): number => {
  const safeViewportWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  const safeContentWidth =
    Number.isFinite(contentWidth) && contentWidth > 0 ? contentWidth : 0;
  const safeHorizontalPadding =
    Number.isFinite(horizontalPadding) && horizontalPadding > 0
      ? horizontalPadding
      : 0;

  return Math.max(
    safeViewportWidth,
    safeContentWidth + safeHorizontalPadding * 2
  );
};

export const resolveGlobalHorizontalOffset = ({
  offsetX,
  surfaceWidth,
  viewportWidth,
}: GlobalHorizontalOffsetInput): number =>
  resolveClampedScrollOffset(offsetX, surfaceWidth, viewportWidth);

export const shouldSuppressPressAfterPinch = (
  lastPinchEndedAt: number | null | undefined,
  now = Date.now(),
  windowMs = PINCH_PRESS_SUPPRESSION_MS
): boolean => {
  if (typeof lastPinchEndedAt !== "number") return false;
  const elapsedMs = now - lastPinchEndedAt;
  return elapsedMs >= 0 && elapsedMs < windowMs;
};
