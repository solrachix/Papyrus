import { describe, expect, it } from "vitest";

import {
  MOBILE_CHROME_METRICS,
  resolveMobileChromeOffsets,
} from "./mobileChromeMetrics";

describe("MOBILE_CHROME_METRICS", () => {
  it("keeps top and bottom chrome icons visually consistent", () => {
    expect(MOBILE_CHROME_METRICS.iconSize).toBe(20);
    expect(MOBILE_CHROME_METRICS.iconBoxSize).toBe(28);
    expect(MOBILE_CHROME_METRICS.topbarPageButtonSize).toBe(30);
  });

  it("keeps floating chrome on the same horizontal grid", () => {
    expect(MOBILE_CHROME_METRICS.screenPadding).toBe(16);
    expect(MOBILE_CHROME_METRICS.maxFloatingWidth).toBe(360);
  });

  it("keeps the expanded tool dock constrained to the mobile chrome grid", () => {
    expect(MOBILE_CHROME_METRICS.maxToolDockWidth).toBe(420);
    expect(MOBILE_CHROME_METRICS.toolDockPaddingTop).toBe(4);
  });

  it("keeps tool dock history controls legible when disabled", () => {
    expect(MOBILE_CHROME_METRICS.toolDockHistoryIconSize).toBe(18);
    expect(MOBILE_CHROME_METRICS.toolDockHistoryGap).toBe(2);
    expect(MOBILE_CHROME_METRICS.toolDockDisabledIconColorDark).toBe("#64748b");
    expect(MOBILE_CHROME_METRICS.toolDockDisabledIconColorLight).toBe("#6b7280");
    expect(MOBILE_CHROME_METRICS.toolDockDisabledOpacity).toBe(0.72);
  });

  it.each([
    [{ top: 0, bottom: 0, left: 0, right: 0 }, { topbar: 0, progress: 66, bottom: 14, search: 20, left: 16, right: 16 }],
    [{ top: 47, bottom: 34, left: 0, right: 0 }, { topbar: 47, progress: 113, bottom: 48, search: 54, left: 16, right: 16 }],
    [{ top: 0, bottom: 24, left: 24, right: 12 }, { topbar: 0, progress: 66, bottom: 38, search: 44, left: 40, right: 28 }],
  ])("computes chrome offsets from safe-area insets", (insets, expected) => {
    expect(resolveMobileChromeOffsets(insets)).toEqual(expected);
  });
});
