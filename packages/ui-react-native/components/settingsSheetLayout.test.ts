import { describe, expect, it } from "vitest";

import { getSettingsSheetMaxHeight } from "./settingsSheetLayout";

describe("getSettingsSheetMaxHeight", () => {
  it("uses 72 percent of compact window height", () => {
    expect(getSettingsSheetMaxHeight(844)).toBeCloseTo(607.68);
  });

  it("caps tall tablet settings sheets at 640 points", () => {
    expect(getSettingsSheetMaxHeight(1180)).toBe(640);
  });

  it("recalculates after window height changes", () => {
    expect(getSettingsSheetMaxHeight(1024)).toBeCloseTo(640);
    expect(getSettingsSheetMaxHeight(700)).toBe(504);
  });
});
