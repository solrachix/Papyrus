export type ScrollDirection = "forward" | "reverse" | "mixed" | "unknown";

export type ScrollPerfSummary = {
  durationMs: number;
  eventCount: number;
  startOffsetY: number;
  endOffsetY: number;
  minOffsetY: number;
  maxOffsetY: number;
  direction: ScrollDirection;
  reason: string;
};

type ScrollSessionStart = {
  started: boolean;
  startOffsetY: number;
  direction: ScrollDirection;
};

type ScrollPerfSessionOptions = {
  now?: () => number;
};

export type ScrollPerfSession = {
  begin: (offsetY: number, reason: string) => ScrollSessionStart;
  track: (offsetY: number) => void;
  end: (reason: string, offsetY?: number) => ScrollPerfSummary | null;
};

const normalizeOffset = (offsetY: number) =>
  Number.isFinite(offsetY) ? Math.max(0, offsetY) : 0;

export function createScrollPerfSession({
  now = () => performance.now(),
}: ScrollPerfSessionOptions = {}): ScrollPerfSession {
  let active = false;
  let startedAt = 0;
  let startOffsetY = 0;
  let lastOffsetY = 0;
  let minOffsetY = 0;
  let maxOffsetY = 0;
  let eventCount = 0;
  let direction: ScrollDirection = "unknown";
  let lastDeltaDirection: "forward" | "reverse" | null = null;

  const reset = () => {
    active = false;
    startedAt = 0;
    startOffsetY = 0;
    lastOffsetY = 0;
    minOffsetY = 0;
    maxOffsetY = 0;
    eventCount = 0;
    direction = "unknown";
    lastDeltaDirection = null;
  };

  const begin = (offsetY: number, _reason: string): ScrollSessionStart => {
    const normalizedOffset = normalizeOffset(offsetY);
    if (active) {
      return {
        started: false,
        startOffsetY,
        direction,
      };
    }

    active = true;
    startedAt = now();
    startOffsetY = normalizedOffset;
    lastOffsetY = normalizedOffset;
    minOffsetY = normalizedOffset;
    maxOffsetY = normalizedOffset;
    eventCount = 0;
    direction = "unknown";
    lastDeltaDirection = null;

    return {
      started: true,
      startOffsetY,
      direction,
    };
  };

  const track = (offsetY: number) => {
    if (!active) begin(offsetY, "implicit");
    const normalizedOffset = normalizeOffset(offsetY);
    const delta = normalizedOffset - lastOffsetY;
    if (delta !== 0) {
      const nextDirection = delta > 0 ? "forward" : "reverse";
      if (lastDeltaDirection && lastDeltaDirection !== nextDirection) {
        direction = "mixed";
      } else if (direction === "unknown") {
        direction = nextDirection;
      }
      lastDeltaDirection = nextDirection;
    }
    eventCount += 1;
    lastOffsetY = normalizedOffset;
    minOffsetY = Math.min(minOffsetY, normalizedOffset);
    maxOffsetY = Math.max(maxOffsetY, normalizedOffset);
  };

  const end = (reason: string, offsetY?: number): ScrollPerfSummary | null => {
    if (!active) return null;
    if (offsetY !== undefined) track(offsetY);
    const summary: ScrollPerfSummary = {
      durationMs: Math.max(0, now() - startedAt),
      eventCount,
      startOffsetY,
      endOffsetY: lastOffsetY,
      minOffsetY,
      maxOffsetY,
      direction,
      reason,
    };
    reset();
    return summary;
  };

  return { begin, track, end };
}
