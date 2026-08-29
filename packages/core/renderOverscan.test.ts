import { describe, expect, it } from "vitest";
import { resolveRenderOverscan } from "./renderOverscan";

describe("render overscan", () => {
  const base = { viewportHeight: 900, estimatedPagePixels: 1_000_000, devicePixelRatio: 1 };

  it("uses fewer neighbor pages as zoom cost rises", () => {
    expect(resolveRenderOverscan({ ...base, zoom: 1 })).toBeGreaterThan(
      resolveRenderOverscan({ ...base, zoom: 3 })
    );
  });

  it("reduces overscan for expensive physical pages", () => {
    expect(resolveRenderOverscan({ ...base, zoom: 1 })).toBeGreaterThan(
      resolveRenderOverscan({ ...base, zoom: 1, estimatedPagePixels: 12_000_000, devicePixelRatio: 3 })
    );
  });

  it("returns a bounded deterministic page count", () => {
    const result = resolveRenderOverscan({
      ...base,
      zoom: 1.4,
      viewportHeight: 0,
      estimatedPagePixels: Number.NaN,
      devicePixelRatio: Number.NaN,
    });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(6);
  });

  it("limits neighboring pages when the aggregate physical window is expensive", () => {
    const result = resolveRenderOverscan({
      zoom: 1,
      estimatedPagePixels: 1_000_000,
      viewportHeight: 900,
      devicePixelRatio: 3,
    });

    expect(result).toBe(1);
  });
});
