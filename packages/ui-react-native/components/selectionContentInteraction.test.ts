import { describe, expect, it } from "vitest";
import {
  isPointInsideSelectionUi,
  shouldDismissSelectionOnContentInteraction,
} from "./selectionContentInteraction";

describe("selection content interaction", () => {
  it.each(["tap", "scroll"] as const)(
    "dismisses an active selection on %s",
    (interaction) => {
      expect(
        shouldDismissSelectionOnContentInteraction({
          selectionActive: true,
          interaction,
        })
      ).toBe(true);
    }
  );

  it("does not dismiss when there is no active selection", () => {
    expect(
      shouldDismissSelectionOnContentInteraction({
        selectionActive: false,
        interaction: "scroll",
      })
    ).toBe(false);
  });
});

describe("selection ui hit testing", () => {
  const rects = [
    { x: 0, y: 0, width: 100, height: 50 },
    { x: 200, y: 0, width: 100, height: 56 },
  ];

  it("accepts a point inside an inflated rect", () => {
    expect(
      isPointInsideSelectionUi({
        point: { x: -8, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(true);
  });

  it("rejects a point outside every inflated rect", () => {
    expect(
      isPointInsideSelectionUi({
        point: { x: 150, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(false);
  });

  it("rejects a point beyond the padding", () => {
    expect(
      isPointInsideSelectionUi({
        point: { x: -12, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(true);
    expect(
      isPointInsideSelectionUi({
        point: { x: -13, y: 25 },
        hitRects: rects,
        padding: 12,
      })
    ).toBe(false);
  });
});
