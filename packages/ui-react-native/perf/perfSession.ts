export type PerfSessionContext = {
  runId?: string;
  sampleId?: string;
  documentLoadId?: string;
  fixture: string;
};

export type PerfSession = {
  enabled: boolean;
  context: Readonly<PerfSessionContext>;
  createId: (kind: string) => string;
  emit: (name: string, payload?: Record<string, unknown>) => void;
};

type PerfSessionOptions = {
  enabled: boolean;
  context: PerfSessionContext;
  now?: () => number;
  sink?: (line: string) => void;
};

let processSessionId = 0;

export function createPerfSession({ enabled, context, now = () => performance.now(), sink = console.log }: PerfSessionOptions): PerfSession {
  const counters = new Map<string, number>();
  const stableContext = Object.freeze({ ...context });
  const createId = (kind: string) => {
    if (!enabled) return 'noop';
    const next = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, next);
    return `${kind}-${next}`;
  };

  return {
    enabled,
    context: stableContext,
    createId,
    emit: (name, payload = {}) => {
      if (!enabled) return;
      const event = {
        timestamp: now(),
        ...stableContext,
        name,
        ...payload,
      };
      sink(JSON.stringify(event));
    },
  };
}

export function createRunId() {
  processSessionId += 1;
  return `run-${processSessionId}`;
}
