import { describe, expect, it } from "vitest";
import {
  resolvePdfAnchoredScrollX,
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
});
