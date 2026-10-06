import { describe, expect, it } from "vitest";

import {
  resolveNativePdfPageChange,
  resolveNativePdfTextSelection,
  resolveNativePdfVisiblePages,
  resolveNativePdfZoomChange,
} from "./nativePdfViewerEvents";

describe("native iOS PDF viewer events", () => {
  it("keeps currentPage in the store's one-based convention", () => {
    expect(resolveNativePdfPageChange(100, 120)).toEqual({ currentPage: 100 });
    expect(resolveNativePdfPageChange(0, 120)).toBeNull();
    expect(resolveNativePdfPageChange(121, 120)).toBeNull();
  });

  it("normalizes native zoom to the reader's supported range", () => {
    expect(resolveNativePdfZoomChange(2.25)).toEqual({ zoom: 2.25 });
    expect(resolveNativePdfZoomChange(0.1)).toEqual({ zoom: 0.5 });
    expect(resolveNativePdfZoomChange(Number.NaN)).toBeNull();
  });

  it("keeps visible page indexes zero-based and removes invalid entries", () => {
    expect(
      resolveNativePdfVisiblePages([
        { pageIndex: 0, visibleRatio: 0.75 },
        { pageIndex: -1, visibleRatio: 1 },
        { pageIndex: 4, visibleRatio: 0 },
      ])
    ).toEqual([{ pageIndex: 0, visibleRatio: 0.75 }]);
  });

  it("preserves selected text, its primary page, and normalized line bounds", () => {
    expect(
      resolveNativePdfTextSelection({
        text: "The word",
        pageIndex: 0,
        rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
      })
    ).toEqual({
      text: "The word",
      pageIndex: 0,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });
  });

  it("treats an empty native selection as a clear event", () => {
    expect(
      resolveNativePdfTextSelection({
        text: "  ",
        pageIndex: 0,
        rects: [],
      })
    ).toBeNull();
  });
});
