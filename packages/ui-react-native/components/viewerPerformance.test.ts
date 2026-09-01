import { describe, expect, it } from "vitest";
import { resolveRemoveClippedSubviews } from "./viewerPerformance";

describe("resolveRemoveClippedSubviews", () => {
  it("keeps native clipping disabled for Android compat surfaces", () => {
    expect(
      resolveRemoveClippedSubviews({
        platform: "android",
        viewerMode: "compat",
        requestedValue: true,
      })
    ).toBe(false);
  });

  it("preserves the requested value outside Android compat", () => {
    expect(
      resolveRemoveClippedSubviews({
        platform: "android",
        viewerMode: "native",
        requestedValue: true,
      })
    ).toBe(true);
    expect(
      resolveRemoveClippedSubviews({
        platform: "ios",
        viewerMode: "compat",
        requestedValue: true,
      })
    ).toBe(true);
  });

  it("defaults to clipping enabled outside Android compat", () => {
    expect(
      resolveRemoveClippedSubviews({
        platform: "web",
        viewerMode: "compat",
      })
    ).toBe(true);
  });
});
