import { describe, expect, it, vi } from "vitest";
import {
  createEpubScrollCheckCoordinator,
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

  it("runs one trailing check after requests arrive during an in-flight check", async () => {
    const deferredChecks: Array<{ resolve: () => void }> = [];
    const check = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          deferredChecks.push({ resolve });
        })
    );
    const coordinator = createEpubScrollCheckCoordinator(check);

    const first = coordinator.request();
    const second = coordinator.request();
    const third = coordinator.request();

    await Promise.resolve();
    expect(check).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(third).toBe(first);

    deferredChecks[0].resolve();
    await first;
    await Promise.resolve();
    await Promise.resolve();

    expect(check).toHaveBeenCalledTimes(2);
    expect(coordinator.isPending()).toBe(true);

    deferredChecks[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(coordinator.isPending()).toBe(false);
  });

  it("clears the in-flight state after a synchronous check failure", async () => {
    const check = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw new Error("sync failure");
      })
      .mockResolvedValueOnce(undefined);
    const coordinator = createEpubScrollCheckCoordinator(check);

    await expect(coordinator.request()).rejects.toThrow("sync failure");
    expect(coordinator.isPending()).toBe(false);
    await expect(coordinator.request()).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("clears the in-flight state after a rejected check", async () => {
    const check = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("async failure"))
      .mockResolvedValueOnce(undefined);
    const coordinator = createEpubScrollCheckCoordinator(check);

    await expect(coordinator.request()).rejects.toThrow("async failure");
    expect(coordinator.isPending()).toBe(false);
    await expect(coordinator.request()).resolves.toBeUndefined();
    expect(check).toHaveBeenCalledTimes(2);
  });
});
