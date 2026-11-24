import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampSheetDrag,
  getSheetDismissDistance,
  shouldDismissSheetOnRelease,
  shouldStartSheetDismissDrag,
} from "./nativeSheetGesture";

describe("native sheet swipe-to-dismiss rules", () => {
  it("starts from the handle even when content is scrolled", () => {
    expect(shouldStartSheetDismissDrag({ dx: 0, dy: 12, scrollOffset: 400, fromHandle: true })).toBe(true);
  });

  it("starts from the body only when scroll content is at the top", () => {
    expect(shouldStartSheetDismissDrag({ dx: 0, dy: 12, scrollOffset: 0, fromHandle: false })).toBe(true);
    expect(shouldStartSheetDismissDrag({ dx: 0, dy: 12, scrollOffset: 30, fromHandle: false })).toBe(false);
  });

  it("ignores upward, tiny and mostly horizontal moves", () => {
    expect(shouldStartSheetDismissDrag({ dx: 0, dy: -20, scrollOffset: 0, fromHandle: true })).toBe(false);
    expect(shouldStartSheetDismissDrag({ dx: 0, dy: 4, scrollOffset: 0, fromHandle: true })).toBe(false);
    expect(shouldStartSheetDismissDrag({ dx: 30, dy: 12, scrollOffset: 0, fromHandle: true })).toBe(false);
  });

  it("dismisses past a quarter of the sheet (capped) or on a fling", () => {
    expect(getSheetDismissDistance(400)).toBe(100);
    expect(getSheetDismissDistance(1000)).toBe(140);
    expect(shouldDismissSheetOnRelease({ dy: 99, vy: 0.1, sheetHeight: 400 })).toBe(false);
    expect(shouldDismissSheetOnRelease({ dy: 101, vy: 0.1, sheetHeight: 400 })).toBe(true);
    expect(shouldDismissSheetOnRelease({ dy: 30, vy: 1.4, sheetHeight: 400 })).toBe(true);
    expect(shouldDismissSheetOnRelease({ dy: -30, vy: 2, sheetHeight: 400 })).toBe(false);
  });

  it("never drags the sheet above its resting position", () => {
    expect(clampSheetDrag(-40)).toBe(0);
    expect(clampSheetDrag(25)).toBe(25);
  });

  it("wires a drag handle, swipe responders and the backdrop close into NativeSheet", () => {
    const source = readFileSync(resolve(__dirname, "NativeSheet.tsx"), "utf8");
    expect(source).toContain("testID=\"papyrus-sheet-drag-handle\"");
    expect(source).toContain("shouldStartSheetDismissDrag");
    expect(source).toContain("shouldDismissSheetOnRelease");
    expect(source).toMatch(/styles\.backdrop[\s\S]*onPress=\{onClose\}/);
  });
});
