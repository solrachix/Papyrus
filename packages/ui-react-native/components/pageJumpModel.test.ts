import { describe, expect, it } from "vitest";

import { resolvePageJumpTarget } from "./pageJumpModel";

describe("resolvePageJumpTarget", () => {
  it("clamps numeric input to the available pages", () => {
    expect(resolvePageJumpTarget("4", 100)).toBe(4);
    expect(resolvePageJumpTarget("0", 100)).toBe(1);
    expect(resolvePageJumpTarget("140", 100)).toBe(100);
  });

  it("returns null for invalid input or empty documents", () => {
    expect(resolvePageJumpTarget("", 100)).toBeNull();
    expect(resolvePageJumpTarget("abc", 100)).toBeNull();
    expect(resolvePageJumpTarget("4", 0)).toBeNull();
  });
});
