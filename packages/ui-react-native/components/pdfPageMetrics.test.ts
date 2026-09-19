import { describe, expect, it } from "vitest";

import {
  resolveMaxPageWidth,
  resolvePdfBasePageWidth,
} from "./pdfPageMetrics";

describe("resolveMaxPageWidth", () => {
  it("accepts only finite positive page width limits", () => {
    expect(resolveMaxPageWidth(760)).toBe(760);
    expect(resolveMaxPageWidth(0)).toBeUndefined();
    expect(resolveMaxPageWidth(-1)).toBeUndefined();
    expect(resolveMaxPageWidth(Number.NaN)).toBeUndefined();
  });
});

describe("resolvePdfBasePageWidth", () => {
  it("fits the page to the useful viewport width", () => {
    expect(
      resolvePdfBasePageWidth({ viewportWidth: 1080, horizontalPadding: 16 })
    ).toBe(1048);
  });

  it("never returns a negative page width", () => {
    expect(
      resolvePdfBasePageWidth({ viewportWidth: 24, horizontalPadding: 16 })
    ).toBe(0);
  });

  it("caps a wide page at the configured fit width", () => {
    expect(
      resolvePdfBasePageWidth({
        viewportWidth: 1080,
        horizontalPadding: 16,
        maxPageWidth: 760,
      })
    ).toBe(760);
  });

  it("does not enlarge compact pages to the maximum", () => {
    expect(
      resolvePdfBasePageWidth({
        viewportWidth: 390,
        horizontalPadding: 16,
        maxPageWidth: 760,
      })
    ).toBe(358);
  });

  it("ignores invalid maximum widths", () => {
    expect(
      resolvePdfBasePageWidth({
        viewportWidth: 1080,
        horizontalPadding: 16,
        maxPageWidth: Number.NaN,
      })
    ).toBe(1048);
  });
});
