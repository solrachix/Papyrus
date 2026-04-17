import { describe, expect, it, vi } from "vitest";
import { createOpenDestinationHandler } from "./BottomBar.actions";

describe("createOpenDestinationHandler", () => {
  it("does not throw when the destination callback is missing", () => {
    const onPress = createOpenDestinationHandler(undefined, "search");

    expect(() => onPress()).not.toThrow();
  });

  it("forwards the selected destination when the callback exists", () => {
    const onOpenDestination = vi.fn();
    const onPress = createOpenDestinationHandler(onOpenDestination, "notes");

    onPress();

    expect(onOpenDestination).toHaveBeenCalledWith("notes");
  });
});