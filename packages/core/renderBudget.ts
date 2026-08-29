export type RenderBudgetInput = {
  logicalWidth: number;
  logicalHeight: number;
  requestedScale: number;
  devicePixelRatio: number;
  maxCanvasPixels: number;
  maxCanvasDimension: number;
};

export type RenderBudget = {
  requestedScale: number;
  rasterScale: number;
  width: number;
  height: number;
  pixelCount: number;
  wasClamped: boolean;
};

export const DEFAULT_MAX_CANVAS_PIXELS = 16_777_216;
export const DEFAULT_MAX_CANVAS_DIMENSION = 8192;

export const resolveRenderBudget = ({
  logicalWidth,
  logicalHeight,
  requestedScale,
  devicePixelRatio,
  maxCanvasPixels,
  maxCanvasDimension,
}: RenderBudgetInput): RenderBudget => {
  const safeWidth = Math.max(1, Number.isFinite(logicalWidth) ? logicalWidth : 1);
  const safeHeight = Math.max(1, Number.isFinite(logicalHeight) ? logicalHeight : 1);
  const safeScale = Math.max(0.01, Number.isFinite(requestedScale) ? requestedScale : 1);
  const safeDpr = Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1);
  const requestedRasterScale = safeScale * safeDpr;
  const maxPixels = Math.max(1, Math.floor(maxCanvasPixels));
  const maxDimension = Math.max(1, Math.floor(maxCanvasDimension));
  const dimensionFactor = Math.min(
    1,
    maxDimension / (safeWidth * requestedRasterScale),
    maxDimension / (safeHeight * requestedRasterScale)
  );
  const pixelFactor = Math.min(
    1,
    Math.sqrt(maxPixels / (safeWidth * safeHeight * requestedRasterScale ** 2))
  );
  const factor = Math.min(dimensionFactor, pixelFactor);
  const rasterScale = requestedRasterScale * factor;
  const width = Math.max(1, Math.min(maxDimension, Math.floor(safeWidth * rasterScale)));
  const height = Math.max(1, Math.min(maxDimension, Math.floor(safeHeight * rasterScale)));

  return {
    requestedScale: safeScale,
    rasterScale,
    width,
    height,
    pixelCount: width * height,
    wasClamped: factor < 1,
  };
};
