import { describe, expect, it } from "vitest";

import { getSearchOverlayLayout } from "./searchOverlayLayout";

describe("getSearchOverlayLayout", () => {
  it("preserves the current compact overlay geometry", () => {
    expect(getSearchOverlayLayout(390)).toEqual({
      frame: { paddingHorizontal: 12 },
      card: null,
    });
  });

  it("centers and constrains the search card at tablet widths", () => {
    expect(getSearchOverlayLayout(768)).toEqual({
      frame: { paddingHorizontal: 24 },
      card: { width: 640, alignSelf: "center" },
    });
  });

  it("keeps the search card capped on wide iPads", () => {
    expect(getSearchOverlayLayout(1180).card).toEqual({
      width: 640,
      alignSelf: "center",
    });
  });
});
