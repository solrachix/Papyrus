import { describe, expect, it } from "vitest";
import { shouldDismissSelectionOnContentInteraction } from "./selectionContentInteraction";

describe("selection content interaction", () => {
  it.each(["tap", "scroll"] as const)(
    "dismisses an active selection on %s",
    (interaction) => {
      expect(
        shouldDismissSelectionOnContentInteraction({
          selectionActive: true,
          interaction,
        })
      ).toBe(true);
    }
  );

  it("does not dismiss when there is no active selection", () => {
    expect(
      shouldDismissSelectionOnContentInteraction({
        selectionActive: false,
        interaction: "scroll",
      })
    ).toBe(false);
  });
});
