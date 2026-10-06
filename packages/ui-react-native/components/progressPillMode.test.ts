import { describe, expect, it } from "vitest";
import { resolveProgressPillMode } from "./progressPillMode";

describe("resolveProgressPillMode", () => {
  it("uses bounded previous and next page controls in single-page mode", () => {
    expect(resolveProgressPillMode("single", 1, 177)).toEqual({
      kind: "navigation",
      previousPage: null,
      nextPage: 2,
    });
    expect(resolveProgressPillMode("single", 177, 177)).toEqual({
      kind: "navigation",
      previousPage: 176,
      nextPage: null,
    });
  });

  it("keeps the scrubber for continuous and double-page modes", () => {
    expect(resolveProgressPillMode("continuous", 4, 10)).toEqual({
      kind: "scrubber",
    });
    expect(resolveProgressPillMode("double", 4, 10)).toEqual({
      kind: "scrubber",
    });
  });
});
