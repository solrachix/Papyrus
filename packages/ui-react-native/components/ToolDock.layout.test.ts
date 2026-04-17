import { describe, expect, it } from "vitest";
import {
  resolveToolDockBaseIconColor,
  resolveToolDockIconColor,
  shouldUseScrollablePrimaryToolsRow,
} from "./ToolDock.layout";

describe("shouldUseScrollablePrimaryToolsRow", () => {
  it("enables horizontal scrolling on compact screens", () => {
    expect(shouldUseScrollablePrimaryToolsRow(320)).toBe(true);
  });

  it("does not force horizontal scrolling on roomy screens", () => {
    expect(shouldUseScrollablePrimaryToolsRow(768)).toBe(false);
  });
});

describe("resolveToolDockIconColor", () => {
  it("uses the selected annotation color for active drawing tools", () => {
    expect(
      resolveToolDockIconColor({
        toolId: "ink",
        isSelected: true,
        annotationColor: "#ef4444",
        accentColor: "#2563eb",
        baseIconColor: "#f8fafc",
      })
    ).toBe("#ef4444");
  });

  it("keeps non-drawing active tools on the chrome accent color", () => {
    expect(
      resolveToolDockIconColor({
        toolId: "select",
        isSelected: true,
        annotationColor: "#ef4444",
        accentColor: "#2563eb",
        baseIconColor: "#f8fafc",
      })
    ).toBe("#2563eb");
  });

  it("keeps inactive tools on their base icon color", () => {
    expect(
      resolveToolDockIconColor({
        toolId: "ink",
        isSelected: false,
        annotationColor: "#ef4444",
        accentColor: "#2563eb",
        baseIconColor: "#f8fafc",
      })
    ).toBe("#f8fafc");
  });

  it("keeps inactive highlighter neutral until selected", () => {
    expect(
      resolveToolDockIconColor({
        toolId: "highlight",
        isSelected: false,
        annotationColor: "#ef4444",
        accentColor: "#2563eb",
        baseIconColor: "#f8fafc",
      })
    ).toBe("#f8fafc");
  });
});

describe("resolveToolDockBaseIconColor", () => {
  it("keeps inactive highlighter neutral instead of pre-tinted yellow", () => {
    expect(resolveToolDockBaseIconColor({ label: "highlight", isDark: true })).toBe(
      "#f8fafc"
    );
  });

  it("keeps notes yellow because note is not a drawing preset", () => {
    expect(resolveToolDockBaseIconColor({ label: "note", isDark: true })).toBe(
      "#f4c430"
    );
  });
});
