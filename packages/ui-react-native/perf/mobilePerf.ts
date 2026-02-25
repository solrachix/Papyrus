type PerfPayload = Record<string, unknown>;

interface MobilePerfGlobalConfig {
  enabled?: boolean;
  sampleMemory?: boolean;
  logPrefix?: string;
  verbose?: boolean;
}

type MobilePerfGlobalValue = boolean | MobilePerfGlobalConfig;

const DEFAULT_PREFIX = '[Papyrus Perf]';
const FRAME_BUDGET_MS = 1000 / 60;

const getPerfGlobal = (): MobilePerfGlobalValue | undefined =>
  (globalThis as Record<string, unknown>).__PAPYRUS_MOBILE_PERF__ as
    | MobilePerfGlobalValue
    | undefined;

const getPerfConfig = () => {
  const value = getPerfGlobal();
  if (value === true) {
    return {
      enabled: true,
      sampleMemory: true,
      logPrefix: DEFAULT_PREFIX,
      verbose: false,
    };
  }
  if (!value || typeof value !== 'object') {
    return {
      enabled: false,
      sampleMemory: false,
      logPrefix: DEFAULT_PREFIX,
      verbose: false,
    };
  }
  return {
    enabled: value.enabled ?? true,
    sampleMemory: value.sampleMemory ?? true,
    logPrefix: value.logPrefix ?? DEFAULT_PREFIX,
    verbose: value.verbose ?? false,
  };
};

const round = (value: number) => Math.round(value * 100) / 100;

const bytesToMb = (bytes: number) => round(bytes / (1024 * 1024));

const getNumericValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const readHermesHeapBytes = (): number | null => {
  const runtimeProperties = (
    globalThis as Record<string, unknown> & {
      HermesInternal?: { getRuntimeProperties?: () => Record<string, unknown> };
    }
  ).HermesInternal?.getRuntimeProperties?.();
  if (!runtimeProperties || typeof runtimeProperties !== 'object') return null;

  const candidates = [
    'JSHeapSize',
    'js_heap_size',
    'HeapSize',
    'heapSize',
    'TotalAllocatedBytes',
    'totalAllocatedBytes',
    'mallocSize',
  ];

  for (const key of candidates) {
    const value = getNumericValue(runtimeProperties[key]);
    if (value !== null) return value;
  }
  return null;
};

const logPerf = (scope: string, event: string, payload?: PerfPayload) => {
  const config = getPerfConfig();
  if (!config.enabled) return;
  const line = `${config.logPrefix}[${scope}] ${event}`;
  if (payload) {
    console.log(line, payload);
    return;
  }
  console.log(line);
};

export const isMobilePerfEnabled = () => getPerfConfig().enabled;

export const perfNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export const sampleMemory = (scope: string, event: string, payload?: PerfPayload) => {
  const config = getPerfConfig();
  if (!config.enabled || !config.sampleMemory) return;

  const performanceMemory = (
    globalThis as Record<string, unknown> & {
      performance?: { memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number } };
    }
  ).performance?.memory;

  const jsHeapUsedBytes = getNumericValue(performanceMemory?.usedJSHeapSize);
  const jsHeapTotalBytes = getNumericValue(performanceMemory?.totalJSHeapSize);
  const hermesHeapBytes = readHermesHeapBytes();

  if (jsHeapUsedBytes === null && jsHeapTotalBytes === null && hermesHeapBytes === null) return;

  logPerf(scope, `memory.${event}`, {
    ...payload,
    jsHeapUsedMb: jsHeapUsedBytes === null ? undefined : bytesToMb(jsHeapUsedBytes),
    jsHeapTotalMb: jsHeapTotalBytes === null ? undefined : bytesToMb(jsHeapTotalBytes),
    hermesHeapMb: hermesHeapBytes === null ? undefined : bytesToMb(hermesHeapBytes),
  });
};

export const createBurstMonitor = (
  scope: string,
  label: string,
  threshold = 12,
  windowMs = 1000
) => {
  let windowStart = 0;
  let calls = 0;

  return (payload?: PerfPayload) => {
    const config = getPerfConfig();
    if (!config.enabled) return;

    const now = perfNow();
    if (windowStart === 0 || now - windowStart > windowMs) {
      windowStart = now;
      calls = 0;
    }

    calls += 1;
    if (calls === threshold || config.verbose) {
      logPerf(scope, `${label}.burst`, {
        calls,
        windowMs: round(now - windowStart),
        ...payload,
      });
    }
  };
};

export const createRenderCounter = (
  scope: string,
  label = 'render',
  reportEvery = 30
) => {
  let count = 0;
  return (payload?: PerfPayload) => {
    const config = getPerfConfig();
    if (!config.enabled) return;
    count += 1;
    if (count === 1 || count % reportEvery === 0 || config.verbose) {
      logPerf(scope, label, {
        count,
        ...payload,
      });
    }
  };
};

interface ScrollMonitor {
  begin: (reason?: string, payload?: PerfPayload) => void;
  track: (timestampMs?: number) => void;
  end: (reason: string, payload?: PerfPayload) => void;
}

export const createScrollPerfMonitor = (scope: string, label = 'scroll'): ScrollMonitor => {
  let active = false;
  let startAt = 0;
  let lastEventAt = 0;
  let sampleEvents = 0;
  let droppedFrames = 0;
  let maxFrameGapMs = 0;

  const reset = () => {
    active = false;
    startAt = 0;
    lastEventAt = 0;
    sampleEvents = 0;
    droppedFrames = 0;
    maxFrameGapMs = 0;
  };

  return {
    begin: (reason, payload) => {
      const config = getPerfConfig();
      if (!config.enabled) return;
      if (active) return;
      active = true;
      startAt = perfNow();
      if (reason && config.verbose) {
        logPerf(scope, `${label}.begin`, {
          reason,
          ...payload,
        });
      }
    },
    track: (timestampMs) => {
      if (!isMobilePerfEnabled()) return;

      const now = typeof timestampMs === 'number' && Number.isFinite(timestampMs)
        ? timestampMs
        : perfNow();

      if (!active) {
        active = true;
        startAt = now;
      }

      if (lastEventAt > 0) {
        const frameGap = Math.max(0, now - lastEventAt);
        maxFrameGapMs = Math.max(maxFrameGapMs, frameGap);
        droppedFrames += Math.max(0, Math.round(frameGap / FRAME_BUDGET_MS) - 1);
      }

      sampleEvents += 1;
      lastEventAt = now;
    },
    end: (reason, payload) => {
      if (!isMobilePerfEnabled() || !active) return;
      const stopAt = lastEventAt || perfNow();
      const durationMs = Math.max(0, stopAt - startAt);
      const estimatedFrameTotal = Math.max(sampleEvents + droppedFrames, 1);
      const fpsEstimate = durationMs > 0 ? (sampleEvents * 1000) / durationMs : 0;

      logPerf(scope, `${label}.${reason}`, {
        durationMs: round(durationMs),
        sampleEvents,
        droppedFrames,
        droppedFramesPct: round((droppedFrames / estimatedFrameTotal) * 100),
        fpsEstimate: round(fpsEstimate),
        maxFrameGapMs: round(maxFrameGapMs),
        ...payload,
      });

      reset();
    },
  };
};

export const logPerfEvent = logPerf;
