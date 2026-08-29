export type PerfRuntime = "web" | "android";
export type PerfPayload = Record<string, unknown>;

export type PerfEvent = {
  runId: string;
  scenario: string;
  runtime: PerfRuntime;
  timestampMs: number;
  scope: string;
  name: string;
  payload?: PerfPayload;
};

export type PerfMeasure = {
  name: string;
  startTimestampMs: number;
  endTimestampMs: number;
  durationMs: number;
};

export type PerfSample = {
  name: string;
  value: number;
  timestampMs: number;
};

export type PerfTelemetrySnapshot = {
  events: PerfEvent[];
  measures: PerfMeasure[];
  counters: Record<string, number>;
  samples: PerfSample[];
};

export type PerfTelemetry = {
  event: (
    name: string,
    payload?: PerfPayload,
    timestampMs?: number,
    scope?: string
  ) => void;
  mark: (name: string, timestampMs?: number) => void;
  measure: (name: string, startMark: string, endMark: string) => void;
  increment: (name: string, amount?: number) => void;
  sample: (name: string, value: number, timestampMs?: number) => void;
  snapshot: () => PerfTelemetrySnapshot;
};

export type PerfTelemetryOptions = {
  enabled?: boolean;
  runId: string;
  scenario: string;
  runtime: PerfRuntime;
  now?: () => number;
};

const clonePayload = (payload?: PerfPayload): PerfPayload | undefined => {
  if (payload === undefined) return undefined;
  return JSON.parse(JSON.stringify(payload)) as PerfPayload;
};

const defaultNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export const createPerfTelemetry = ({
  enabled = false,
  runId,
  scenario,
  runtime,
  now = defaultNow,
}: PerfTelemetryOptions): PerfTelemetry => {
  const events: Array<PerfEvent & { sequence: number }> = [];
  const measures: PerfMeasure[] = [];
  const counters: Record<string, number> = {};
  const samples: PerfSample[] = [];
  const marks = new Map<string, number>();
  let sequence = 0;

  const timestamp = (value?: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : now();

  return {
    event: (name, payload, timestampMs, scope = "telemetry") => {
      if (!enabled) return;
      events.push({
        runId,
        scenario,
        runtime,
        timestampMs: timestamp(timestampMs),
        scope,
        name,
        payload: clonePayload(payload),
        sequence: sequence++,
      });
    },
    mark: (name, timestampMs) => {
      if (!enabled) return;
      marks.set(name, timestamp(timestampMs));
    },
    measure: (name, startMark, endMark) => {
      if (!enabled) return;
      const startTimestampMs = marks.get(startMark);
      const endTimestampMs = marks.get(endMark);
      if (
        startTimestampMs === undefined ||
        endTimestampMs === undefined ||
        endTimestampMs < startTimestampMs
      ) {
        return;
      }
      measures.push({
        name,
        startTimestampMs,
        endTimestampMs,
        durationMs: endTimestampMs - startTimestampMs,
      });
    },
    increment: (name, amount = 1) => {
      if (!enabled) return;
      if (!Number.isFinite(amount)) return;
      counters[name] = (counters[name] ?? 0) + amount;
    },
    sample: (name, value, timestampMs) => {
      if (!enabled || !Number.isFinite(value)) return;
      samples.push({ name, value, timestampMs: timestamp(timestampMs) });
    },
    snapshot: () => ({
      events: events
        .slice()
        .sort(
          (left, right) =>
            left.timestampMs - right.timestampMs || left.sequence - right.sequence
        )
        .map(({ sequence: _sequence, ...event }) => ({
          ...event,
          payload: clonePayload(event.payload),
        })),
      measures: measures.map((measure) => ({ ...measure })),
      counters: { ...counters },
      samples: samples.map((sample) => ({ ...sample })),
    }),
  };
};
