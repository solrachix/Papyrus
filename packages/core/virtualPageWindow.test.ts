import { describe, expect, it } from "vitest";

import { resolveVirtualPageWindow } from "./virtualPageWindow";

describe("virtual page window", () => {
  it("keeps a large document bounded around the anchor page", () => {
    const window = resolveVirtualPageWindow({
      pageCount: 5000,
      anchorIndex: 2500,
      overscan: 1,
    });

    expect(window).toEqual({
      start: 2499,
      end: 2501,
      count: 3,
      beforeCount: 2499,
      afterCount: 2498,
    });
  });
});
