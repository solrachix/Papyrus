export type WebPinchPreviewInput = {
  startZoom: number;
  scaleFactor: number;
  minZoom: number;
  maxZoom: number;
};

export type WebPinchAnchorInput = {
  startScrollTop: number;
  focalViewportY: number;
  startZoom: number;
  finalZoom: number;
  maxScrollTop: number;
};

export const resolveWebPinchPreviewZoom = ({
  startZoom,
  scaleFactor,
  minZoom,
  maxZoom,
}: WebPinchPreviewInput): number => {
  const safeStart = Number.isFinite(startZoom) && startZoom > 0 ? startZoom : 1;
  const safeScale =
    Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return Math.min(maxZoom, Math.max(minZoom, safeStart * safeScale));
};

export const resolveWebPinchAnchorScrollTop = ({
  startScrollTop,
  focalViewportY,
  startZoom,
  finalZoom,
  maxScrollTop,
}: WebPinchAnchorInput): number => {
  const ratio = finalZoom / Math.max(startZoom, 0.0001);
  const anchored = (startScrollTop + focalViewportY) * ratio - focalViewportY;
  return Math.min(maxScrollTop, Math.max(0, anchored));
};
