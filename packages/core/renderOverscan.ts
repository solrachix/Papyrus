export type RenderOverscanInput = {
  zoom: number;
  estimatedPagePixels: number;
  viewportHeight: number;
  devicePixelRatio: number;
};

export const resolveRenderOverscan = ({
  zoom,
  estimatedPagePixels,
  viewportHeight,
  devicePixelRatio,
}: RenderOverscanInput): number => {
  const safeZoom = Number.isFinite(zoom) ? zoom : 1;
  const safePixels = Number.isFinite(estimatedPagePixels)
    ? estimatedPagePixels
    : 1_000_000;
  const safeDpr = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const viewportFactor = viewportHeight >= 1200 ? 1 : viewportHeight > 0 ? 0 : -1;
  let overscan = safeZoom <= 1 ? 6 : safeZoom <= 1.5 ? 4 : safeZoom <= 2.5 ? 3 : 2;
  overscan += viewportFactor;
  if (safePixels >= 8_000_000 || safeDpr >= 3) overscan -= 2;
  else if (safePixels >= 4_000_000 || safeDpr >= 2) overscan -= 1;
  return Math.max(1, Math.min(6, overscan));
};
