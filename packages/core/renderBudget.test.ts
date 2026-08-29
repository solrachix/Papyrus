import { describe, expect, it } from "vitest";
import { resolveRenderBudget } from "./renderBudget";

describe("render budget", () => {
  it("clamps physical pixels while preserving logical render scale", () => {
    const result = resolveRenderBudget({
      logicalWidth: 595,
      logicalHeight: 842,
      requestedScale: 10,
      devicePixelRatio: 3,
      maxCanvasPixels: 4_000_000,
      maxCanvasDimension: 4096,
    });

    expect(result.wasClamped).toBe(true);
    expect(result.width * result.height).toBeLessThanOrEqual(4_000_000);
    expect(result.width).toBeLessThanOrEqual(4096);
    expect(result.requestedScale).toBe(10);
    expect(result.rasterScale).toBeLessThan(10 * 3);
  });

  it("accounts for DPR when the requested render fits", () => {
    const dpr1 = resolveRenderBudget({
      logicalWidth: 500,
      logicalHeight: 700,
      requestedScale: 1,
      devicePixelRatio: 1,
      maxCanvasPixels: 10_000_000,
      maxCanvasDimension: 8192,
    });
    const dpr3 = resolveRenderBudget({
      logicalWidth: 500,
      logicalHeight: 700,
      requestedScale: 1,
      devicePixelRatio: 3,
      maxCanvasPixels: 10_000_000,
      maxCanvasDimension: 8192,
    });

    expect(dpr1.width).toBe(500);
    expect(dpr3.width).toBe(1500);
  });

  it("does not exceed the pixel budget after dimension rounding", () => {
    const result = resolveRenderBudget({
      logicalWidth: 1500,
      logicalHeight: 2000,
      requestedScale: 3,
      devicePixelRatio: 3,
      maxCanvasPixels: 16_777_216,
      maxCanvasDimension: 8192,
    });

    expect(result.pixelCount).toBeLessThanOrEqual(16_777_216);
  });
});
