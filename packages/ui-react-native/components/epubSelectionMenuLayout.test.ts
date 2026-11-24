import { describe, expect, it } from "vitest";
import { getSelectionMenuPosition } from "./epubSelectionMenuLayout";

const container = { width: 400, height: 800 };
const menu = { width: 300, height: 100 };

describe("EPUB selection menu placement", () => {
  it("centres above the selection when there is room", () => {
    expect(getSelectionMenuPosition({ anchor: { x: 150, y: 400, width: 100, height: 20 }, menu, container })).toEqual({ left: 50, top: 290, placement: "above" });
  });
  it("clamps inside the right edge for a selection near the edge", () => {
    const position = getSelectionMenuPosition({ anchor: { x: 370, y: 400, width: 25, height: 20 }, menu, container })!;
    expect(position.left + menu.width).toBeLessThanOrEqual(container.width - 12);
    expect(position.left).toBe(88);
  });
  it("clamps inside the left edge", () => {
    expect(getSelectionMenuPosition({ anchor: { x: 0, y: 400, width: 10, height: 20 }, menu, container })!.left).toBe(12);
  });
  it("flips below the selection when there is no room above", () => {
    expect(getSelectionMenuPosition({ anchor: { x: 150, y: 60, width: 100, height: 20 }, menu, container, topInset: 24 })).toEqual({ left: 50, top: 110, placement: "below" });
  });
  it("stays on screen for a selection taller than the free space", () => {
    const position = getSelectionMenuPosition({ anchor: { x: 0, y: 20, width: 400, height: 760 }, menu, container })!;
    expect(position.top).toBeGreaterThanOrEqual(12);
    expect(position.top + menu.height).toBeLessThanOrEqual(788);
  });
  it("hides when the selection scrolled out of view", () => {
    expect(getSelectionMenuPosition({ anchor: { x: 0, y: -200, width: 100, height: 20 }, menu, container })).toBeNull();
    expect(getSelectionMenuPosition({ anchor: { x: 0, y: 900, width: 100, height: 20 }, menu, container })).toBeNull();
  });
  it("centres a menu wider than the container", () => {
    expect(getSelectionMenuPosition({ anchor: { x: 0, y: 400, width: 10, height: 20 }, menu: { width: 390, height: 100 }, container })!.left).toBe(5);
  });
});
