import { describe, expect, it } from "vitest";

import { resolvePdfBasePageWidth } from "./pdfPageMetrics";

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
});
