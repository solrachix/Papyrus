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
    expect(report.metrics.peakMemoryBytes).toBeNull();
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
          ],
          measures: [
            {
              name: "zoom.commitToSurfaceReady",
              durationMs: 150,
            },
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
        zoomCommitToSurfaceReadyMs: 150,
        frameDrops: { over16ms: 2, over33ms: 1, maxIntervalMs: 40 },
        peakMemoryBytes: 900,
        jumpLatencyMs: 120,
        wrappers: 13,
        canvases: 7,
        pageRenderers: 4,
      });
      expect(readFileSync(markdown, "utf8")).toContain("large-1000");
      expect(readFileSync(markdown, "utf8")).toContain("150 ms");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
