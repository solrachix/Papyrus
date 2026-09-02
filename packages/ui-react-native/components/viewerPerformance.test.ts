import { describe, expect, it } from "vitest";
import {
  resolveOrientationScrollOffset,
  resolveRemoveClippedSubviews,
} from "./viewerPerformance";

describe("resolveOrientationScrollOffset", () => {
  it("uses the new layout offset for the current page after rotation", () => {
    expect(
      resolveOrientationScrollOffset({
        currentPage: 4,
        pageCount: 1000,
        isDouble: false,
        getItemOffset: (index) => index * 2894 + 18,
      })
    ).toBe(8700);
  });

  it("maps the current page to its row in double-page mode", () => {
    expect(
      resolveOrientationScrollOffset({
        currentPage: 4,
        pageCount: 1000,
        isDouble: true,
        getItemOffset: (index) => index * 2000 + 18,
      })
    ).toBe(2018);
  });
});

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
