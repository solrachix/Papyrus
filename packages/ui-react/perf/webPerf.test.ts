import { describe, expect, it, vi } from "vitest";
import { createWebPerfCollector } from "./webPerf";

describe("web performance collector", () => {
  it("keeps the collector inert when browser performance APIs are unavailable", () => {
    const performanceMemory = { usedJSHeapSize: 42 };
    const performanceRef = {
      memory: performanceMemory,
      mark: vi.fn(),
      measure: vi.fn(),
    };

    const collector = createWebPerfCollector({
      enabled: false,
      runId: "run-disabled",
      scenario: "small-20",
      fixture: "small-20",
      performanceRef,
      windowRef: {},
    });

    collector.startFrameSampling();
    collector.event("should.not.record");
    collector.recordViewerWindow(document.body);

    expect(performanceRef.mark).not.toHaveBeenCalled();
    expect(performanceRef.measure).not.toHaveBeenCalled();
    expect(collector.snapshot()).toEqual({
      events: [],
      measures: [],
      counters: {},
      samples: [],
      frames: {
        total: 0,
        over16ms: 0,
        over33ms: 0,
        maxIntervalMs: 0,
      },
      dom: null,
      memory: null,
      environment: {
        runtime: "web",
        fixture: "small-20",
      },
    });
  });

  it("records viewer window counts and frame drops without calling them hardware FPS", () => {
    let frameCallback: ((timestamp: number) => void) | null = null;
    const requestAnimationFrame = vi.fn((callback: (timestamp: number) => void) => {
      frameCallback = callback;
      return 1;
    });
    const cancelAnimationFrame = vi.fn();
    const collector = createWebPerfCollector({
      enabled: true,
      runId: "run-web",
      scenario: "large-1000",
      fixture: "large-1000",
      commitSha: "abc123",
      windowRef: {
        devicePixelRatio: 2,
        innerWidth: 800,
        innerHeight: 600,
        requestAnimationFrame,
        cancelAnimationFrame,
      },
    });
    const root = document.createElement("main");
    root.innerHTML =
      '<div class="page-container"><canvas></canvas><div data-papyrus-page-renderer></div></div>' +
      '<div class="page-container"><canvas></canvas></div>';

    collector.startFrameSampling();
    frameCallback?.(100);
    frameCallback?.(118);
    frameCallback?.(152);
    collector.stopFrameSampling();
    collector.recordViewerWindow(root);

    const snapshot = collector.snapshot();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(snapshot.frames).toEqual({
      total: 3,
      over16ms: 2,
      over33ms: 1,
      maxIntervalMs: 34,
    });
    expect(snapshot.dom).toEqual({
      pageContainers: 2,
      canvases: 2,
      pageRenderers: 1,
    });
    expect(snapshot.events.at(-1)).toMatchObject({
      runId: "run-web",
      scenario: "large-1000",
      runtime: "web",
      name: "viewer.window",
      payload: {
        pageContainers: 2,
        canvases: 2,
        pageRenderers: 1,
      },
    });
    expect(snapshot.environment).toEqual({
      runtime: "web",
      fixture: "large-1000",
      commitSha: "abc123",
      viewport: { width: 800, height: 600 },
      devicePixelRatio: 2,
    });
  });

  it("resets frame counters and returns an isolated named session", () => {
    let frameCallback: ((timestamp: number) => void) | null = null;
    const collector = createWebPerfCollector({
      enabled: true,
      runId: "run-session",
      scenario: "interactive",
      windowRef: {
        requestAnimationFrame: vi.fn((callback: (timestamp: number) => void) => {
          frameCallback = callback;
          return 1;
        }),
        cancelAnimationFrame: vi.fn(),
      },
    });

    collector.startFrameSampling("pinch");
    frameCallback?.(100);
    frameCallback?.(120);
    expect(collector.stopFrameSampling()).toEqual({
      label: "pinch",
      total: 2,
      over16ms: 1,
      over33ms: 0,
      maxIntervalMs: 20,
    });

    collector.startFrameSampling("jump");
    frameCallback?.(500);
    expect(collector.snapshot().frames).toEqual({
      total: 1,
      over16ms: 0,
      over33ms: 0,
      maxIntervalMs: 0,
    });
  });

  it("uses the query flag only as an explicit opt-in and tolerates missing observers", () => {
    const collector = createWebPerfCollector({
      runId: "run-query",
      scenario: "medium-200",
      locationSearch: "?papyrusPerf=1",
      windowRef: {},
      performanceRef: {},
      performanceObserverRef: undefined,
    });

    collector.startFrameSampling();
    collector.mark("pinch.commit", 10);
    collector.mark("surface.ready", 40);
    collector.measure("zoom.commitToSurfaceReady", "pinch.commit", "surface.ready");

    expect(collector.snapshot().measures).toEqual([
      {
        name: "zoom.commitToSurfaceReady",
        startTimestampMs: 10,
        endTimestampMs: 40,
        durationMs: 30,
      },
    ]);
  });
});
