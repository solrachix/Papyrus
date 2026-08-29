import { describe, expect, it } from "vitest";

import { createPerfTelemetry } from "./perfTelemetry";

describe("performance telemetry", () => {
  it("records common events and measures commit to surface ready", () => {
    const telemetry = createPerfTelemetry({
      enabled: true,
      runId: "run-1",
      scenario: "small-20",
      runtime: "web",
      now: () => 100,
    });

    telemetry.mark("pinch.commit", 100);
    telemetry.event("zoom.commit", { zoom: 2 }, 110);
    telemetry.mark("surface.ready", 250);
    telemetry.measure(
      "zoom.commitToSurfaceReady",
      "pinch.commit",
      "surface.ready"
    );
    telemetry.increment("render.ready");

    expect(telemetry.snapshot()).toEqual({
      events: [
        {
          runId: "run-1",
          scenario: "small-20",
          runtime: "web",
          timestampMs: 110,
          scope: "telemetry",
          name: "zoom.commit",
          payload: { zoom: 2 },
        },
      ],
      measures: [
        {
          name: "zoom.commitToSurfaceReady",
          startTimestampMs: 100,
          endTimestampMs: 250,
          durationMs: 150,
        },
      ],
      counters: { "render.ready": 1 },
      samples: [],
    });
  });

  it("sorts out-of-order events and keeps snapshots isolated", () => {
    const telemetry = createPerfTelemetry({
      enabled: true,
      runId: "run-2",
      scenario: "large-1000",
      runtime: "android",
    });

    telemetry.event("surface.ready", { pageIndex: 4 }, 300);
    telemetry.event("render.start", { pageIndex: 4 }, 200);
    telemetry.sample("peakMemoryMb", 128, 400);

    const first = telemetry.snapshot();
    first.events[0].payload = { pageIndex: 99 };
    const second = telemetry.snapshot();

    expect(second.events.map((event) => event.name)).toEqual([
      "render.start",
      "surface.ready",
    ]);
    expect(second.events[1].payload).toEqual({ pageIndex: 4 });
    expect(second.samples).toEqual([
      { name: "peakMemoryMb", value: 128, timestampMs: 400 },
    ]);
  });

  it("does not record or log when disabled", () => {
    const telemetry = createPerfTelemetry({
      enabled: false,
      runId: "run-disabled",
      scenario: "small-20",
      runtime: "web",
    });

    telemetry.event("should.not.exist");
    telemetry.mark("start", 10);
    telemetry.mark("end", 20);
    telemetry.measure("ignored", "start", "end");
    telemetry.increment("ignored");
    telemetry.sample("ignored", 1);

    expect(telemetry.snapshot()).toEqual({
      events: [],
      measures: [],
      counters: {},
      samples: [],
    });
  });
});
