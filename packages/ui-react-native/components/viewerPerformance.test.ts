import { describe, expect, it } from "vitest";
import { resolveRemoveClippedSubviews } from "./viewerPerformance";

describe("resolveRemoveClippedSubviews", () => {
  it("defaults native clipping off for Android compat surfaces", () => {
    expect(
      resolveRemoveClippedSubviews({
        platform: "android",
        viewerMode: "compat",
      })
    ).toBe(false);
  });

  it("respects an explicit Android compat override", () => {
    expect(
      resolveRemoveClippedSubviews({
        platform: "android",
        viewerMode: "compat",
        requestedValue: true,
      })
    ).toBe(true);
    expect(
      resolveRemoveClippedSubviews({
        platform: "android",
        viewerMode: "compat",
        requestedValue: false,
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
