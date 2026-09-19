import { describe, expect, it } from "vitest";

import {
  getNativeSheetWidth,
  getNativeSheetLayoutStyles,
  getNativeSheetSizeStyle,
} from "./nativeSheetLayout";

describe("getNativeSheetSizeStyle", () => {
  it("gives flex content a concrete height when the sheet has a numeric limit", () => {
    expect(getNativeSheetSizeStyle(504)).toEqual({
      maxHeight: 504,
      height: 504,
    });
  });

  it("keeps percentage limits as max-height-only styles", () => {
    expect(getNativeSheetSizeStyle("78%")).toEqual({ maxHeight: "78%" });
  });
});

describe("getNativeSheetLayoutStyles", () => {
  it("preserves the full-width bottom sheet on compact screens", () => {
    expect(getNativeSheetLayoutStyles(390)).toBeNull();
    expect(getNativeSheetLayoutStyles(767)).toBeNull();
  });

  it("centers a capped floating sheet on tablet widths", () => {
    expect(getNativeSheetLayoutStyles(768)).toEqual({
      root: {
        justifyContent: "center",
        paddingHorizontal: 32,
        paddingVertical: 24,
      },
      sheet: {
        width: 640,
        alignSelf: "center",
        borderRadius: 24,
        borderBottomWidth: 1,
      },
    });
  });

  it("caps wide iPad sheets at 640 points", () => {
    expect(getNativeSheetLayoutStyles(1180)?.sheet).toMatchObject({
      width: 640,
      alignSelf: "center",
    });
  });
});

describe("getNativeSheetWidth", () => {
  it("keeps compact sheets full width and applies tablet gutters", () => {
    expect(getNativeSheetWidth(390)).toBe(390);
    expect(getNativeSheetWidth(768)).toBe(640);
    expect(getNativeSheetWidth(1180)).toBe(640);
  });

  it("uses the available width when a tablet window is narrower than the cap", () => {
    expect(getNativeSheetWidth(800)).toBe(640);
    expect(getNativeSheetWidth(700)).toBe(700);
  });
});
