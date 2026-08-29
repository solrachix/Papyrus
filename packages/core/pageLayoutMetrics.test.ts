import { describe, expect, it } from "vitest";

import {
  createPageLayoutMetrics,
  scalePageLayoutMetrics,
} from "./pageLayoutMetrics";

describe("page layout metrics", () => {
  it("scales cached base offsets without rebuilding page arrays", () => {
    const base = createPageLayoutMetrics({
      itemCount: 4,
      itemSpacing: 28,
      topPadding: 18,
      bottomPadding: 120,
      estimatedLength: 128,
      getBaseItemLength: (index) => 100 + index * 10 + 28,
    });

    const scaled = scalePageLayoutMetrics(base, 2);

    expect(scaled.getOffset(1)).toBe(246);
    expect(scaled.getLength(1)).toBe(248);
    expect(scaled.getTotalContentHeight()).toBe(1170);
    expect(scaled.itemCount).toBe(4);
  });
});
