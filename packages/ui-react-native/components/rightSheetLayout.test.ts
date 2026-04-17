import { describe, expect, it } from "vitest";

import { resolveRightSheetHeight } from "./rightSheetLayout";

describe("resolveRightSheetHeight", () => {
  it("uses a shorter sheet for notes than for navigation content", () => {
    expect(resolveRightSheetHeight({ windowHeight: 900, showingNotes: true })).toBe(
      440
    );
    expect(
      resolveRightSheetHeight({ windowHeight: 900, showingNotes: false })
    ).toBe(640);
  });

  it("scales notes height down on shorter screens", () => {
    expect(resolveRightSheetHeight({ windowHeight: 700, showingNotes: true })).toBe(
      392.00000000000006
    );
    expect(
      resolveRightSheetHeight({ windowHeight: 700, showingNotes: false })
    ).toBe(504);
  });
});
