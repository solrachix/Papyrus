import { describe, expect, it } from "vitest";

import { getNativeSheetSizeStyle } from "./nativeSheetLayout";

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
