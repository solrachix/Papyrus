import { describe, expect, it } from "vitest";
import {
  hasViewerViewportGeometryChanged,
  resolveOrientationScrollOffset,
  resolveRemoveClippedSubviews,
} from "./viewerPerformance";

describe("hasViewerViewportGeometryChanged", () => {
  it("detects vertical-only resizes when height-fit changes page geometry", () => {
    expect(
      hasViewerViewportGeometryChanged({
        previous: { width: 1180, pageFitHeight: 784 },
        next: { width: 1180, pageFitHeight: 664 },
      })
    ).toBe(true);
    expect(
      hasViewerViewportGeometryChanged({
        previous: { width: 820, pageFitHeight: 784 },
        next: { width: 1180, pageFitHeight: 784 },
      })
    ).toBe(true);
    expect(
      hasViewerViewportGeometryChanged({
        previous: { width: 1180 },
        next: { width: 1180, pageFitHeight: 784 },
      })
    ).toBe(false);
  });

  it("computes a fresh vertical offset for page 50 after the resize", () => {
    expect(
      resolveOrientationScrollOffset({
        currentPage: 50,
        pageCount: 1000,
        isDouble: false,
        getItemOffset: (index) => index * 1700 + 18,
      })
    ).toBe(49 * 1700 + 18);
  });
});

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
