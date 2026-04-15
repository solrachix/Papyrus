import { describe, expect, it } from "vitest";
import { shouldUseScrollablePrimaryToolsRow } from "./ToolDock.layout";

describe("shouldUseScrollablePrimaryToolsRow", () => {
  it("enables horizontal scrolling on compact screens", () => {
    expect(shouldUseScrollablePrimaryToolsRow(320)).toBe(true);
  });

  it("does not force horizontal scrolling on roomy screens", () => {
    expect(shouldUseScrollablePrimaryToolsRow(768)).toBe(false);
  });
});
