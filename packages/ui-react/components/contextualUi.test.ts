import { describe, expect, it } from "vitest";
import { resolveContextualUiPosition } from "./contextualUi";

describe("contextual UI positioning", () => {
  it("moves a menu left when it would overflow the right edge", () => {
    expect(
      resolveContextualUiPosition(
        { x: 290, y: 40 },
        { width: 120, height: 40 },
        { width: 320, height: 640 }
      )
    ).toEqual({ left: 192, top: 40 });
  });

  it("opens above an anchor near the bottom and stays inside the viewport", () => {
    expect(
      resolveContextualUiPosition(
        { x: 24, y: 620 },
        { width: 180, height: 56 },
        { width: 320, height: 640 }
      )
    ).toEqual({ left: 24, top: 556 });
  });

  it("clamps a large menu with a safety margin on every edge", () => {
    expect(
      resolveContextualUiPosition(
        { x: -100, y: -20 },
        { width: 500, height: 700 },
        { width: 320, height: 640 },
        8
      )
    ).toEqual({ left: 8, top: 8 });
  });
});
