import { describe, expect, it } from "vitest";
import {
  pageContainsScrollTarget,
  resolveViewerScrollTarget,
} from "./viewerNavigation";

describe("viewer navigation targets", () => {
  it.each([
    [0, false, 0],
    [0, true, 0],
    [1, true, 0],
    [2, true, 1],
    [8, true, 4],
    [8, false, 8],
  ])("keeps page and list indexes distinct for page %i", (pageIndex, isDouble, listIndex) => {
    expect(resolveViewerScrollTarget(pageIndex, isDouble)).toEqual({
      pageIndex,
      listIndex,
    });
  });

  it("resolves the last page in an odd double-page document", () => {
    const target = resolveViewerScrollTarget(10, true);
    expect(target.listIndex).toBe(5);
    expect(pageContainsScrollTarget({ left: 10, right: null }, target.pageIndex)).toBe(true);
  });

  it("does not resolve a row merely because its list index matches the page index", () => {
    const target = resolveViewerScrollTarget(9, true);
    expect(target.listIndex).toBe(4);
    expect(pageContainsScrollTarget({ left: 8, right: 9 }, target.pageIndex)).toBe(true);
    expect(pageContainsScrollTarget({ left: 4, right: 5 }, target.pageIndex)).toBe(false);
  });
});
