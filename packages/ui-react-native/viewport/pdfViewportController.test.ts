import { describe, expect, it } from "vitest";
import {
  resolvePdfAnchoredScrollX,
  resolvePdfPageAnchoredScrollX,
  resolvePdfAnchoredScrollY,
  resolvePdfCenteredInset,
  resolvePdfSurfaceWidth,
  resolvePdfVerticalAnchorMode,
} from "./pdfViewportController";

describe("pdfViewportController", () => {
  it("uses page vertical anchoring only when the focal point is inside the page", () => {
    expect(
      resolvePdfVerticalAnchorMode({
        focalY: 200,
        startScrollY: 100,
        startPageOffsetY: 240,
        startPageHeight: 700,
      })
    ).toBe("page");

    expect(
      resolvePdfVerticalAnchorMode({
        focalY: 80,
        startScrollY: 100,
        startPageOffsetY: 240,
        startPageHeight: 700,
      })
    ).toBe("document");
  });

  it("resolves vertical scroll from page and document anchors", () => {
    expect(
      resolvePdfAnchoredScrollY({
        mode: "page",
        focalY: 150,
        startScrollY: 300,
        startPageOffsetY: 200,
        startPageHeight: 1000,
        startContentHeight: 1800,
        endPageOffsetY: 260,
        endPageHeight: 1400,
        endContentHeight: 2200,
        viewportHeight: 500,
      })
    ).toBe(460);

    expect(
      resolvePdfAnchoredScrollY({
        mode: "document",
        focalY: 240,
        startScrollY: 360,
        startPageOffsetY: 200,
        startPageHeight: 1000,
        startContentHeight: 1200,
        endPageOffsetY: 260,
        endPageHeight: 1400,
        endContentHeight: 1800,
        viewportHeight: 600,
      })
    ).toBe(660);
  });

  it("resolves horizontal anchoring and centering primitives", () => {
    expect(
      resolvePdfAnchoredScrollX({
        focalViewportX: 220,
        startSurfaceScrollX: 160,
        startSurfaceWidth: 760,
        endSurfaceWidth: 1040,
        viewportWidth: 400,
      })
    ).toBe(300);

    expect(
      resolvePdfSurfaceWidth({
        viewportWidth: 400,
        contentWidth: 520,
        horizontalPadding: 16,
      })
    ).toBe(552);

    expect(
      resolvePdfCenteredInset({
        viewportLength: 400,
        contentLength: 320,
      })
    ).toBe(40);
  });

  it("keeps a pinch focal point anchored on a centered page narrower than the iPad viewport", () => {
    expect(
      resolvePdfPageAnchoredScrollX({
        focalViewportX: 316,
        startSurfaceScrollX: 0,
        viewportWidth: 1100,
        endSurfaceWidth: 1552,
        startPageOffsetX: 0,
        endPageOffsetX: 0,
        startPageFrameWidth: 1100,
        endPageFrameWidth: 1552,
        startPageWidth: 760,
        endPageWidth: 1520,
      })
    ).toBe(0);

    const nextScrollX = resolvePdfPageAnchoredScrollX({
      focalViewportX: 500,
      startSurfaceScrollX: 0,
      viewportWidth: 1100,
      endSurfaceWidth: 1552,
      startPageOffsetX: 0,
      endPageOffsetX: 0,
      startPageFrameWidth: 1100,
      endPageFrameWidth: 1552,
      startPageWidth: 760,
      endPageWidth: 1520,
    });

    expect(nextScrollX).toBe(176);
    expect(16 + (500 + 0 - 170) * 2 - nextScrollX).toBe(500);
  });

  it("keeps the pinch focal point anchored for an uncapped phone page", () => {
    const nextScrollX = resolvePdfPageAnchoredScrollX({
      focalViewportX: 220,
      startSurfaceScrollX: 0,
      viewportWidth: 400,
      endSurfaceWidth: 768,
      startPageOffsetX: 0,
      endPageOffsetX: 0,
      startPageFrameWidth: 400,
      endPageFrameWidth: 768,
      startPageWidth: 368,
      endPageWidth: 736,
    });

    expect(nextScrollX).toBe(204);
    expect(16 + (220 - 16) * 2 - nextScrollX).toBe(220);
  });
});
