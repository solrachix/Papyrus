import { describe, expect, it } from "vitest";
import {
  createEpubScrollStallDetector,
  getEpubScrollDirection,
} from "./epubScrollDiagnostics";

describe("EPUB scroll diagnostics", () => {
  it("classifies upward movement from the scroll offset", () => {
    expect(getEpubScrollDirection(400, 420)).toBe("up");
    expect(getEpubScrollDirection(420, 400)).toBe("down");
    expect(getEpubScrollDirection(400, 400)).toBe("none");
  });

  it("reports a reverse-scroll stall only after valid consecutive moves", () => {
    const detector = createEpubScrollStallDetector({
      minConsecutiveSamples: 3,
      minDurationMs: 150,
      movementThresholdPx: 4,
      offsetEpsilonPx: 1,
    });

    expect(
      detector.push({
        timestamp: 0,
        scrollTop: 420,
        previousScrollTop: 420,
        deltaY: 18,
        scrollHeight: 2000,
        clientHeight: 600,
        scrollEnabled: true,
        selectionActive: false,
        gestureLock: false,
        spineIndex: 4,
        progress: 0.3,
      })
    ).toBeNull();

    expect(
      detector.push({
        timestamp: 70,
        scrollTop: 420,
        previousScrollTop: 420,
        deltaY: 18,
        scrollHeight: 2000,
        clientHeight: 600,
        scrollEnabled: true,
        selectionActive: false,
        gestureLock: false,
        spineIndex: 4,
        progress: 0.3,
      })
    ).toBeNull();

    const stall = detector.push({
      timestamp: 180,
      scrollTop: 420,
      previousScrollTop: 420,
      deltaY: 18,
      scrollHeight: 2000,
      clientHeight: 600,
      scrollEnabled: true,
      selectionActive: false,
      gestureLock: false,
      spineIndex: 4,
      progress: 0.3,
    });

    expect(stall).toMatchObject({
      name: "epub.scroll.stall",
      direction: "up",
      scrollTop: 420,
      consecutiveSamples: 3,
      durationMs: 180,
      spineIndex: 4,
    });
  });

  it("ignores top, disabled, selected, and genuinely moving samples", () => {
    const detector = createEpubScrollStallDetector();
    const base = {
      timestamp: 0,
      scrollTop: 0,
      previousScrollTop: 0,
      deltaY: 20,
      scrollHeight: 2000,
      clientHeight: 600,
      scrollEnabled: true,
      selectionActive: false,
      gestureLock: false,
      spineIndex: 0,
      progress: 0,
    };

    expect(detector.push(base)).toBeNull();
    expect(detector.push({ ...base, timestamp: 100, scrollEnabled: false })).toBeNull();
    expect(detector.push({ ...base, timestamp: 200, selectionActive: true })).toBeNull();
    expect(
      detector.push({
        ...base,
        timestamp: 300,
        scrollTop: 380,
        previousScrollTop: 400,
      })
    ).toBeNull();
  });

});
