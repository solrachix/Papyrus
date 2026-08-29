import {
  createPerfTelemetry,
  type PerfPayload,
  type PerfTelemetry,
  type PerfTelemetrySnapshot,
} from "@papyrus-sdk/core";

type WebMemory = {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
};

type WebPerformance = {
  memory?: Partial<WebMemory>;
  mark?: (name: string) => void;
  measure?: (name: string, startMark?: string, endMark?: string) => void;
};

type WebWindow = {
  devicePixelRatio?: number;
  innerWidth?: number;
  innerHeight?: number;
  requestAnimationFrame?: (callback: (timestamp: number) => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
};

type WebPerformanceObserverEntry = {
  duration?: number;
  startTime?: number;
};

type WebPerformanceObserver = {
  observe: (options: { entryTypes: string[] }) => void;
  disconnect: () => void;
};

type WebPerformanceObserverConstructor = new (
  callback: (list: {
    getEntries: () => WebPerformanceObserverEntry[];
  }) => void
) => WebPerformanceObserver;

export type WebFrameSamplingSession = {
  label: string;
  total: number;
  over16ms: number;
  over33ms: number;
  maxIntervalMs: number;
};

export type WebPerfSnapshot = PerfTelemetrySnapshot & {
  frames: {
    total: number;
    over16ms: number;
    over33ms: number;
    maxIntervalMs: number;
  };
  dom: {
    pageContainers: number;
    canvases: number;
    pageRenderers: number;
  } | null;
  memory: WebMemory | null;
  environment: {
    runtime: "web";
    fixture?: string;
    commitSha?: string;
    viewport?: { width: number; height: number };
    devicePixelRatio?: number;
  };
};

export type WebPerfCollector = Omit<PerfTelemetry, "snapshot" | "mark" | "measure"> & {
  mark: (name: string, timestampMs?: number) => void;
  measure: (name: string, startMark: string, endMark: string) => void;
  startFrameSampling: (label?: string) => void;
  stopFrameSampling: () => WebFrameSamplingSession | null;
  recordViewerWindow: (root: ParentNode | null) => void;
  snapshot: () => WebPerfSnapshot;
};

export type WebPerfOptions = {
  enabled?: boolean;
  runId: string;
  scenario: string;
  fixture?: string;
  commitSha?: string;
  now?: () => number;
  locationSearch?: string;
  windowRef?: WebWindow;
  documentRef?: ParentNode;
  performanceRef?: WebPerformance;
  performanceObserverRef?: WebPerformanceObserverConstructor;
};

const getGlobalFlag = () => {
  const value = (globalThis as typeof globalThis & {
    __PAPYRUS_WEB_PERF__?: unknown;
  }).__PAPYRUS_WEB_PERF__;
  return value === true || value === "1";
};

const queryOptIn = (locationSearch?: string) => {
  if (!locationSearch) return false;
  return new URLSearchParams(locationSearch).get("papyrusPerf") === "1";
};

const getDefaultWindow = (): WebWindow | undefined =>
  typeof window === "undefined" ? undefined : window;

const getDefaultDocument = (): ParentNode | undefined =>
  typeof document === "undefined" ? undefined : document;

const getDefaultPerformance = (): WebPerformance | undefined =>
  typeof performance === "undefined" ? undefined : performance;

const getDefaultObserver = (): WebPerformanceObserverConstructor | undefined =>
  typeof PerformanceObserver === "undefined" ? undefined : PerformanceObserver;

const collectDom = (root: ParentNode | null) => {
  if (!root) return null;
  return {
    pageContainers: root.querySelectorAll(".page-container").length,
    canvases: root.querySelectorAll("canvas").length,
    pageRenderers: root.querySelectorAll("[data-papyrus-page-renderer]").length,
  };
};

const collectMemory = (performanceRef: WebPerformance | undefined): WebMemory | null => {
  const memory = performanceRef?.memory;
  if (
    memory?.usedJSHeapSize == null ||
    memory.totalJSHeapSize == null ||
    memory.jsHeapSizeLimit == null
  ) {
    return null;
  }
  return {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  };
};

export const createWebPerfCollector = ({
  enabled,
  runId,
  scenario,
  fixture,
  commitSha,
  now,
  locationSearch,
  windowRef = getDefaultWindow(),
  documentRef = getDefaultDocument(),
  performanceRef = getDefaultPerformance(),
  performanceObserverRef = getDefaultObserver(),
}: WebPerfOptions): WebPerfCollector => {
  const isEnabled =
    enabled ??
    (getGlobalFlag() ||
      queryOptIn(
        locationSearch ??
          (typeof location === "undefined" ? undefined : location.search)
      ));
  const telemetry = createPerfTelemetry({
    enabled: isEnabled,
    runId,
    scenario,
    runtime: "web",
    now,
  });
  let rootRef: ParentNode | null = null;
  let frameHandle: number | null = null;
  let frameSamplingActive = false;
  let previousFrameTimestamp: number | null = null;
  let frameTotal = 0;
  let frameOver16 = 0;
  let frameOver33 = 0;
  let maxFrameInterval = 0;
  let frameSamplingLabel = "default";
  let longTaskObserver: WebPerformanceObserver | null = null;

  const stopFrameSampling = (): WebFrameSamplingSession | null => {
    if (!frameSamplingActive) return null;
    frameSamplingActive = false;
    if (frameHandle !== null) {
      windowRef?.cancelAnimationFrame?.(frameHandle);
      frameHandle = null;
    }
    longTaskObserver?.disconnect();
    longTaskObserver = null;
    return {
      label: frameSamplingLabel,
      total: frameTotal,
      over16ms: frameOver16,
      over33ms: frameOver33,
      maxIntervalMs: maxFrameInterval,
    };
  };

  const startLongTaskObserver = () => {
    if (!isEnabled || !performanceObserverRef || longTaskObserver) return;
    try {
      longTaskObserver = new performanceObserverRef((list) => {
        for (const entry of list.getEntries()) {
          const durationMs = entry.duration ?? 0;
          telemetry.increment("frame.longtask");
          telemetry.sample("frame.longtaskMs", durationMs, entry.startTime);
        }
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      longTaskObserver = null;
    }
  };

  const startFrameSampling = (label = "default") => {
    if (!isEnabled || frameSamplingActive || !windowRef?.requestAnimationFrame) {
      return;
    }
    frameSamplingLabel = label;
    previousFrameTimestamp = null;
    frameTotal = 0;
    frameOver16 = 0;
    frameOver33 = 0;
    maxFrameInterval = 0;
    frameSamplingActive = true;
    startLongTaskObserver();
    const tick = (timestamp: number) => {
      if (!frameSamplingActive) return;
      frameTotal += 1;
      if (previousFrameTimestamp !== null) {
        const interval = Math.max(0, timestamp - previousFrameTimestamp);
        maxFrameInterval = Math.max(maxFrameInterval, interval);
        if (interval > 16.67) frameOver16 += 1;
        if (interval > 33.33) frameOver33 += 1;
      }
      previousFrameTimestamp = timestamp;
      frameHandle = windowRef.requestAnimationFrame!(tick);
    };
    frameHandle = windowRef.requestAnimationFrame(tick);
  };

  const mark = (name: string, timestampMs?: number) => {
    if (!isEnabled) return;
    telemetry.mark(name, timestampMs);
    try {
      performanceRef?.mark?.(`papyrus:${name}`);
    } catch {
      // Browser marks are supplementary; the in-memory clock remains authoritative.
    }
  };

  const measure = (name: string, startMark: string, endMark: string) => {
    if (!isEnabled) return;
    telemetry.measure(name, startMark, endMark);
    try {
      performanceRef?.measure?.(
        `papyrus:${name}`,
        `papyrus:${startMark}`,
        `papyrus:${endMark}`
      );
    } catch {
      // Missing browser marks must not affect the shared telemetry snapshot.
    }
  };

  const recordViewerWindow = (root: ParentNode | null) => {
    if (!isEnabled) return;
    rootRef = root;
    const dom = collectDom(root);
    if (!dom) return;
    telemetry.event("viewer.window", dom as PerfPayload, undefined, "viewer");
  };

  const snapshot = (): WebPerfSnapshot => {
    const environment: WebPerfSnapshot["environment"] = { runtime: "web" };
    if (fixture) environment.fixture = fixture;
    if (commitSha) environment.commitSha = commitSha;
    if (
      windowRef?.innerWidth != null &&
      windowRef.innerHeight != null &&
      Number.isFinite(windowRef.innerWidth) &&
      Number.isFinite(windowRef.innerHeight)
    ) {
      environment.viewport = {
        width: windowRef.innerWidth,
        height: windowRef.innerHeight,
      };
    }
    if (
      windowRef?.devicePixelRatio != null &&
      Number.isFinite(windowRef.devicePixelRatio)
    ) {
      environment.devicePixelRatio = windowRef.devicePixelRatio;
    }
    return {
      ...telemetry.snapshot(),
      frames: {
        total: frameTotal,
        over16ms: frameOver16,
        over33ms: frameOver33,
        maxIntervalMs: maxFrameInterval,
      },
      dom: isEnabled ? collectDom(rootRef ?? documentRef ?? null) : null,
      memory: isEnabled ? collectMemory(performanceRef) : null,
      environment,
    };
  };

  return {
    ...telemetry,
    mark,
    measure,
    startFrameSampling,
    stopFrameSampling,
    recordViewerWindow,
    snapshot,
  };
};

let defaultCollector: WebPerfCollector | null = null;

export const getWebPerfCollector = (): WebPerfCollector => {
  if (defaultCollector) return defaultCollector;
  defaultCollector = createWebPerfCollector({
    runId: "papyrus-viewer",
    scenario: "interactive",
  });
  if (typeof window !== "undefined") {
    (window as typeof window & {
      __PAPYRUS_WEB_PERF__?: WebPerfCollector;
    }).__PAPYRUS_WEB_PERF__ = defaultCollector;
  }
  return defaultCollector;
};
