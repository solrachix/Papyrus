import { describe, expect, it, vi } from "vitest";

import { getProgressPillInteraction } from "./progressPillInteraction";

describe("getProgressPillInteraction", () => {
  it("keeps navigation and page jump actions on the whole pill", () => {
    const onPress = vi.fn();
    const onLongPress = vi.fn();

    expect(getProgressPillInteraction(onPress, onLongPress)).toEqual({
      onPress,
      onLongPress,
      accessibilityLabel: "Open document navigation",
      accessibilityRole: "button",
    });
  });
});
