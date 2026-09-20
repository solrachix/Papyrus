import { describe, expect, it } from "vitest";

import {
  getRightSheetThumbnailLayout,
  resolveRightSheetHeight,
  supportsPageThumbnails,
} from "./rightSheetLayout";

describe("resolveRightSheetHeight", () => {
  it("uses a shorter sheet for notes than for navigation content", () => {
    expect(
      resolveRightSheetHeight({ windowHeight: 900, showingNotes: true }),
    ).toBe(440);
    expect(
      resolveRightSheetHeight({ windowHeight: 900, showingNotes: false }),
    ).toBe(640);
  });

  it("scales notes height down on shorter screens", () => {
    expect(
      resolveRightSheetHeight({ windowHeight: 700, showingNotes: true }),
    ).toBe(392.00000000000006);
    expect(
      resolveRightSheetHeight({ windowHeight: 700, showingNotes: false }),
    ).toBe(504);
  });

  it("does not offer page thumbnails for reflowable EPUBs", () => {
    expect(supportsPageThumbnails("epub")).toBe(false);
    expect(supportsPageThumbnails("pdf")).toBe(true);
    expect(supportsPageThumbnails("comic")).toBe(true);
    expect(supportsPageThumbnails("text")).toBe(false);
  });
});

describe("getRightSheetThumbnailLayout", () => {
  it("sizes the two-column thumbnail grid to the sheet, not the whole iPad window", () => {
    expect(getRightSheetThumbnailLayout(640)).toEqual({
      cardWidth: 298,
      frameWidth: 282,
    });
  });

  it("preserves the compact phone thumbnail size", () => {
    expect(getRightSheetThumbnailLayout(390)).toEqual({
      cardWidth: 173,
      frameWidth: 157,
    });
  });

  it("returns zero-sized cells until the sheet has a measurable width", () => {
    expect(getRightSheetThumbnailLayout(0)).toEqual({
      cardWidth: 0,
      frameWidth: 0,
    });
  });
});
