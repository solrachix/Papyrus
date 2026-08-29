import { performance } from "node:perf_hooks";
import {
  DEFAULT_MAX_CANVAS_DIMENSION,
  DEFAULT_MAX_CANVAS_PIXELS,
  resolveRenderBudget,
  resolveRenderOverscan,
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
  const startedAt = performance.now();
  let checksum = 0;
  for (let index = 0; index < touchedPages; index += 1) {
    checksum += (index % pageCount) + 1;
  }
  return {
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
    pagesTouched: touchedPages,
    checksum,
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
  const layout = measureSyntheticLayout(documentPages, mountedPages);
  const staleRendersDiscarded = Math.min(3, Math.max(0, zoom - 1));
  const cancelledRenders = Math.min(2, Math.max(0, zoom - 1));

  return {
    label,
    documentPages,
    zoom,
    currentPage,
    synthetic: true,
    baseline: {
      mountedPages: Math.min(documentPages, 13),
      renderPageCalls: Math.min(documentPages, 13),
      layoutPagesTouched: documentPages,
      note: "estimativa sintética da janela fixa e layout proporcional ao documento",
    },
    currentPolicy: {
      mountedPages,
      renderPageCalls: mountedPages,
      maxCanvasPixels: DEFAULT_MAX_CANVAS_PIXELS,
      requestedPixels: Math.round(
        PAGE_WIDTH * PAGE_HEIGHT * zoom * zoom * DEVICE_PIXEL_RATIO * DEVICE_PIXEL_RATIO
      ),
      actualPixels: budget.width * budget.height,
      canvasClamped: budget.wasClamped,
      overscan,
      staleRendersDiscarded,
      cancelledRenders,
      layoutDurationMs: layout.durationMs,
      layoutPagesTouched: layout.pagesTouched,
      layoutRebuildPages: documentPages,
      viewerRenderingPages: mountedPages,
    },
    metrics: {
      "render.start": mountedPages,
      "render.complete": mountedPages,
      "render.cancel": cancelledRenders,
      "render.staleDiscard": staleRendersDiscarded,
      "render.promote": mountedPages,
      "canvas.requestedPixels": Math.round(
        PAGE_WIDTH * PAGE_HEIGHT * zoom * zoom * DEVICE_PIXEL_RATIO * DEVICE_PIXEL_RATIO
      ),
      "canvas.actualPixels": budget.pixelCount,
      "canvas.clamped": budget.wasClamped,
      "viewer.mountedPages": mountedPages,
      "viewer.renderingPages": mountedPages,
      "layout.durationMs": layout.durationMs,
      "layout.pagesTouched": layout.pagesTouched,
      "layout.rebuildPages": documentPages,
    },
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
