import { performance } from "node:perf_hooks";
import {
  DEFAULT_MAX_CANVAS_DIMENSION,
  DEFAULT_MAX_CANVAS_PIXELS,
  DEFAULT_MAX_RENDER_WINDOW_PIXELS,
  createPageLayoutMetrics,
  resolveRenderBudget,
  resolveRenderOverscan,
  scalePageLayoutMetrics,
} from "../../packages/core/dist/index.js";

const scenarios = [
  { documentPages: 20, zoom: 3, currentPage: 10, label: "20 pages, zoom 1 -> 3" },
  { documentPages: 500, zoom: 4, currentPage: 250, label: "500 pages, zoom 1 -> 4" },
  { documentPages: 1000, zoom: 5, currentPage: 500, label: "1000 pages, page 500, zoom 1 -> 5" },
  { documentPages: 5000, zoom: 4, currentPage: 2500, label: "5000 pages, jump 1 -> 2500 -> 4999" },
];

const PAGE_WIDTH = 1500;
const PAGE_HEIGHT = 2000;
const VIEWPORT_HEIGHT = 900;
const DEVICE_PIXEL_RATIO = 3;

const measureSyntheticLayout = (pageCount, touchedPages) => {
  const buildStartedAt = performance.now();
  const base = createPageLayoutMetrics({
    itemCount: pageCount,
    itemSpacing: 28,
    topPadding: 18,
    bottomPadding: 120,
    estimatedLength: PAGE_HEIGHT / 0.77 + 28,
    getBaseItemLength: (index) =>
      PAGE_HEIGHT * (1 + (index % 5) * 0.015) + 28,
  });
  const buildDurationMs = Number((performance.now() - buildStartedAt).toFixed(3));
  const scaled = scalePageLayoutMetrics(base, 4);
  const queryStartedAt = performance.now();
  let checksum = 0;
  for (let index = 0; index < touchedPages; index += 1) {
    checksum += scaled.getOffset((index * 997) % pageCount);
  }
  return {
    buildDurationMs,
    queryDurationMs: Number((performance.now() - queryStartedAt).toFixed(3)),
    pagesTouched: touchedPages,
    prefixPagesBuilt: base.lengths.length,
    scaledContentHeight: Math.round(scaled.getTotalContentHeight()),
    checksum: Math.round(checksum),
  };
};

const runScenario = ({ documentPages, zoom, currentPage, label }) => {
  const overscan = resolveRenderOverscan({
    zoom,
    estimatedPagePixels: PAGE_WIDTH * PAGE_HEIGHT * zoom * zoom,
    viewportHeight: VIEWPORT_HEIGHT,
    devicePixelRatio: DEVICE_PIXEL_RATIO,
  });
  const mountedPages = Math.min(documentPages, overscan * 2 + 1);
  const budget = resolveRenderBudget({
    logicalWidth: PAGE_WIDTH,
    logicalHeight: PAGE_HEIGHT,
    requestedScale: zoom,
    devicePixelRatio: DEVICE_PIXEL_RATIO,
    maxCanvasPixels: DEFAULT_MAX_CANVAS_PIXELS,
    maxCanvasDimension: DEFAULT_MAX_CANVAS_DIMENSION,
  });
  const layout = measureSyntheticLayout(documentPages, 3);
  const requestedPhysicalPagePixels =
    PAGE_WIDTH * PAGE_HEIGHT * zoom * zoom * DEVICE_PIXEL_RATIO * DEVICE_PIXEL_RATIO;

  return {
    label,
    documentPages,
    zoom,
    currentPage,
      synthetic: true,
      baseline: {
      renderWindowPages: Math.min(documentPages, 13),
      layoutPagesTouched: documentPages,
      note: "estimativa sintética; não é uma medição histórica do viewer",
      },
      currentPolicy: {
      renderWindowPages: mountedPages,
      maxCanvasPixels: DEFAULT_MAX_CANVAS_PIXELS,
      requestedPixels: Math.round(
        PAGE_WIDTH * PAGE_HEIGHT * zoom * zoom * DEVICE_PIXEL_RATIO * DEVICE_PIXEL_RATIO
      ),
      actualPixels: budget.width * budget.height,
      canvasClamped: budget.wasClamped,
      overscan,
      layoutBuildDurationMs: layout.buildDurationMs,
      layoutQueryDurationMs: layout.queryDurationMs,
      layoutPagesTouched: layout.pagesTouched,
      layoutPrefixPagesBuilt: layout.prefixPagesBuilt,
      aggregateWindowPixels: budget.pixelCount * (overscan * 2 + 1),
      requestedAggregateWindowPixels: Math.round(
        requestedPhysicalPagePixels * (overscan * 2 + 1)
      ),
      maxAggregateWindowPixels: DEFAULT_MAX_RENDER_WINDOW_PIXELS,
      },
    measuredMetrics: {
      "canvas.requestedPixels": Math.round(
        PAGE_WIDTH * PAGE_HEIGHT * zoom * zoom * DEVICE_PIXEL_RATIO * DEVICE_PIXEL_RATIO
      ),
      "canvas.actualPixels": budget.pixelCount,
      "canvas.clamped": budget.wasClamped,
      "layout.buildDurationMs": layout.buildDurationMs,
      "layout.queryDurationMs": layout.queryDurationMs,
      "layout.pagesTouched": layout.pagesTouched,
      "layout.prefixPagesBuilt": layout.prefixPagesBuilt,
      "layout.contentHeight": layout.scaledContentHeight,
      "viewer.renderWindowPages": mountedPages,
      "viewer.aggregateWindowPixels": budget.pixelCount * (overscan * 2 + 1),
      "viewer.requestedAggregateWindowPixels": Math.round(
        requestedPhysicalPagePixels * (overscan * 2 + 1)
      ),
    },
    unavailableRuntimeMetrics: [
      "render.cancel",
      "render.staleDiscard",
      "render.promote",
      "viewer.mountedPages",
      "viewer.renderingPages",
    ],
  };
};

console.log(JSON.stringify({
  benchmark: "papyrus-zoom-performance",
  generatedAt: new Date().toISOString(),
  environment: {
    synthetic: true,
    pageSizeCssPx: [PAGE_WIDTH, PAGE_HEIGHT],
    devicePixelRatio: DEVICE_PIXEL_RATIO,
    viewportHeight: VIEWPORT_HEIGHT,
    note: "não substitui medição em aparelho ou navegador real",
  },
  scenarios: scenarios.map(runScenario),
}, null, 2));
