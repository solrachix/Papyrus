import { describe, expect, it } from "vitest";
import {
  resolveWebPinchAnchorScrollLeft,
  resolveWebPinchAnchorScrollTop,
  resolveWebPinchPreviewZoom,
} from "./pinchZoom";

describe("web pinch zoom", () => {
  it("calculates preview zoom without committing document state", () => {
    expect(
      resolveWebPinchPreviewZoom({
        startZoom: 1,
        scaleFactor: 1.8,
        minZoom: 0.5,
        maxZoom: 5,
      })
    ).toBe(1.8);
  });

  it("keeps the focal viewport point anchored after commit", () => {
    expect(
      resolveWebPinchAnchorScrollTop({
        startScrollTop: 300,
        focalViewportY: 180,
        startZoom: 1,
        finalZoom: 2,
        maxScrollTop: 2_000,
      })
    ).toBe(780);
  });

  it("keeps the horizontal focal viewport point anchored after commit", () => {
    expect(
      resolveWebPinchAnchorScrollLeft({
        startScrollLeft: 240,
        focalViewportX: 160,
        startZoom: 1,
        finalZoom: 2,
        maxScrollLeft: 2_000,
      })
    ).toBe(640);
  });

  it("clamps preview and anchored scroll to configured bounds", () => {
    expect(
      resolveWebPinchPreviewZoom({
        startZoom: 4,
        scaleFactor: 2,
        minZoom: 0.5,
        maxZoom: 5,
      })
    ).toBe(5);
    expect(
      resolveWebPinchAnchorScrollTop({
        startScrollTop: 0,
        focalViewportY: 100,
        startZoom: 2,
        finalZoom: 0.5,
        maxScrollTop: 600,
      })
    ).toBe(0);
  });
});
