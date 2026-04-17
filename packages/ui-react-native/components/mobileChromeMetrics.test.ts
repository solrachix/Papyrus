import { describe, expect, it } from "vitest";

import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";

describe("MOBILE_CHROME_METRICS", () => {
  it("keeps top and bottom chrome icons visually consistent", () => {
    expect(MOBILE_CHROME_METRICS.iconSize).toBe(20);
    expect(MOBILE_CHROME_METRICS.iconBoxSize).toBe(28);
    expect(MOBILE_CHROME_METRICS.topbarPageButtonSize).toBe(30);
  });
});
