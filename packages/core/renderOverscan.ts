export type RenderOverscanInput = {
  zoom: number;
  estimatedPagePixels: number;
  viewportHeight: number;
  devicePixelRatio: number;
  maxAggregatePixels?: number;
};

export const DEFAULT_MAX_RENDER_WINDOW_PIXELS = 32 * 1024 * 1024;

export const resolveRenderOverscan = ({
  zoom,
  estimatedPagePixels,
  viewportHeight,
  devicePixelRatio,
  maxAggregatePixels = DEFAULT_MAX_RENDER_WINDOW_PIXELS,
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
  const physicalPagePixels = safePixels * Math.max(1, safeDpr) ** 2;
  const maxWindowPages = Math.max(
    1,
    Math.floor(Math.max(1, maxAggregatePixels) / physicalPagePixels)
  );
  const aggregateOverscan = Math.floor((maxWindowPages - 1) / 2);
  return Math.max(0, Math.min(6, overscan, aggregateOverscan));
};
