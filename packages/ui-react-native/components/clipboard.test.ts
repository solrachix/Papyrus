import { describe, expect, it, vi } from "vitest";
import { copySelectionText } from "./clipboard";

describe("copySelectionText", () => {
  it("copies normal text and reports success", async () => {
    const setString = vi.fn().mockResolvedValue(undefined);
    await expect(copySelectionText("texto", { setString })).resolves.toBe(true);
    expect(setString).toHaveBeenCalledWith("texto");
  });

  it("does not call the clipboard for empty text", async () => {
    const setString = vi.fn().mockResolvedValue(undefined);
    await expect(copySelectionText("  ", { setString })).resolves.toBe(false);
    expect(setString).not.toHaveBeenCalled();
  });

  it("reports clipboard failures without hiding the selection", async () => {
    const setString = vi.fn().mockRejectedValue(new Error("clipboard down"));
    await expect(copySelectionText("texto", { setString })).resolves.toBe(false);
  });
});
