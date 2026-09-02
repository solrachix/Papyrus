import { describe, expect, it } from "vitest";
import { createScrollPerfSession } from "./scrollPerfSession";

describe("createScrollPerfSession", () => {
  it("summarizes one drag and its direction without logging every frame", () => {
    let now = 100;
    const session = createScrollPerfSession({ now: () => now });

    expect(session.begin(0, "continuous.beginDrag")).toMatchObject({
      started: true,
      startOffsetY: 0,
      direction: "unknown",
    });

    now = 140;
    session.track(420);
    now = 190;
    session.track(900);
    now = 260;
    session.track(640);

    expect(session.end("continuous.momentumEnd")).toEqual({
      durationMs: 160,
      eventCount: 3,
      startOffsetY: 0,
      endOffsetY: 640,
      minOffsetY: 0,
      maxOffsetY: 900,
      direction: "mixed",
      reason: "continuous.momentumEnd",
    });
  });

  it("does not start a second session while one is active", () => {
    const session = createScrollPerfSession({ now: () => 10 });

    expect(session.begin(20, "drag").started).toBe(true);
    expect(session.begin(40, "momentum")).toMatchObject({
      started: false,
      startOffsetY: 20,
    });
  });
});
