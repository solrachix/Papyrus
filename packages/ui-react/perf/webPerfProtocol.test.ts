import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/benchmarks/web-perf.mjs");

const runReport = (args: string[]) =>
  JSON.parse(execFileSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" }));

describe("web performance protocol", () => {
  it("does not fabricate metrics when no browser snapshot was captured", () => {
    const report = runReport(["--fixture", "small-20"]);

    expect(report.status).toBe("not-run");
    expect(report.metrics.zoomCommitToSurfaceReadyMs).toBeNull();
    expect(report.metrics.frameDrops).toBeNull();
    expect(report.metrics.heapAtSnapshotBytes).toBeNull();
    expect(report.metrics.jumpLatencyMs).toBeNull();
    expect(report.limitations.some((limitation: string) => limitation.includes("snapshot do browser"))).toBe(true);
  });

  it("summarizes the captured snapshot and writes a Markdown companion", () => {
    const directory = mkdtempSync(join(tmpdir(), "papyrus-web-perf-"));
    const input = join(directory, "snapshot.json");
    const markdown = join(directory, "report.md");
    try {
      writeFileSync(
        input,
        JSON.stringify({
          events: [
            { name: "zoom.commit", timestampMs: 100 },
            { name: "surface.ready", timestampMs: 250 },
            { name: "jump.start", timestampMs: 300 },
            { name: "jump.end", timestampMs: 420 },
            { name: "jump.start", timestampMs: 600 },
            { name: "pinch.frames", scope: "pinch", payload: { label: "pinch", total: 20, over16ms: 2, over33ms: 1, maxIntervalMs: 40 } },
            { name: "pinch.frames", scope: "pinch", payload: { label: "pinch", total: 22, over16ms: 5, over33ms: 2, maxIntervalMs: 70 } },
            { name: "pinch.frames", scope: "pinch", payload: { label: "pinch", total: 18, over16ms: 1, over33ms: 0, maxIntervalMs: 32 } },
          ],
          measures: [
            {
              name: "zoom.commitToSurfaceReady",
              durationMs: 150,
            },
            {
              name: "zoom.commitToSurfaceReady",
              durationMs: 220,
            },
            {
              name: "zoom.commitToSurfaceReady",
              durationMs: 260,
            },
            { name: "jump.duration", durationMs: 120 },
            { name: "jump.duration", durationMs: 180 },
          ],
          frames: { total: 20, over16ms: 2, over33ms: 1, maxIntervalMs: 40 },
          dom: { pageContainers: 13, canvases: 7, pageRenderers: 4 },
          memory: { usedJSHeapSize: 900, totalJSHeapSize: 1200, jsHeapSizeLimit: 4000 },
          environment: {
            runtime: "web",
            fixture: "large-1000",
            viewport: { width: 800, height: 600 },
            devicePixelRatio: 2,
          },
        })
      );

      const report = runReport([
        "--input",
        input,
        "--markdown",
        markdown,
        "--fixture",
        "large-1000",
      ]);

      expect(report.status).toBe("captured");
      expect(report.metrics).toMatchObject({
        zoomCommitToSurfaceReadyMs: {
          samples: 3,
          medianMs: 220,
          p90Ms: 260,
          p95Ms: 260,
          maxMs: 260,
        },
        frameDrops: {
          sessions: 3,
          totalFrames: 60,
          over16ms: { samples: 3, medianMs: 2, p90Ms: 5, p95Ms: 5, maxMs: 5 },
          over33ms: { samples: 3, medianMs: 1, p90Ms: 2, p95Ms: 2, maxMs: 2 },
          maxIntervalMs: { samples: 3, medianMs: 40, p90Ms: 70, p95Ms: 70, maxMs: 70 },
        },
        heapAtSnapshotBytes: 900,
        jumpLatencyMs: {
          samples: 2,
          medianMs: 120,
          p90Ms: 180,
          p95Ms: 180,
          maxMs: 180,
        },
        wrappers: 13,
        canvases: 7,
        pageRenderers: 4,
      });
      expect(readFileSync(markdown, "utf8")).toContain("large-1000");
      expect(readFileSync(markdown, "utf8")).toContain("220 / 260 / 260 / 260 ms (n=3)");
      expect(readFileSync(markdown, "utf8")).toContain("Sessões de pinch | 3");
      expect(readFileSync(markdown, "utf8")).toContain("Frames amostrados | 60");
      expect(readFileSync(markdown, "utf8")).toContain("2 / 5 / 5 / 5 (n=3)");
      expect(readFileSync(markdown, "utf8")).not.toContain("[object Object]");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
