import { describe, expect, it } from "vitest";
import { buildBottomBarLayout } from "./bottomBarModel";

describe("buildBottomBarLayout", () => {
  it("keeps notes on the left and info on the right for pdf", () => {
    const layout = buildBottomBarLayout({
      documentType: "pdf",
      activeMobileDestination: "none",
      toolDockOpen: false,
    });

    expect(layout.leftSlots.map((slot) => slot.key)).toEqual([
      "annotate",
      "notes",
    ]);
    expect(layout.rightSlots.map((slot) => slot.key)).toEqual([
      "search",
      "info",
      "more",
    ]);
  });

  it("keeps notes accessible on the left for epub and text", () => {
    const epubLayout = buildBottomBarLayout({
      documentType: "epub",
      activeMobileDestination: "notes",
      toolDockOpen: false,
    });
    const textLayout = buildBottomBarLayout({
      documentType: "text",
      activeMobileDestination: "none",
      toolDockOpen: false,
    });

    expect(epubLayout.leftSlots.map((slot) => slot.key)).toEqual(["notes"]);
    expect(textLayout.leftSlots.map((slot) => slot.key)).toEqual(["notes"]);
    expect(epubLayout.rightSlots.map((slot) => slot.key)).toEqual([
      "search",
      "info",
      "more",
    ]);
  });
});
