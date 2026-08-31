export type EpubScrollDirection = "up" | "down" | "none";

export type EpubScrollSample = {
  timestamp: number;
  scrollTop: number;
  previousScrollTop: number;
  deltaY: number;
  scrollHeight: number;
  clientHeight: number;
  scrollEnabled: boolean;
  selectionActive: boolean;
  gestureLock: boolean;
  spineIndex: number | null;
  progress: number | null;
};

export type EpubScrollStall = {
  name: "epub.scroll.stall";
  direction: "up";
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  consecutiveSamples: number;
  durationMs: number;
  deltaY: number;
  scrollEnabled: boolean;
  selectionActive: boolean;
  gestureLock: boolean;
  spineIndex: number | null;
  progress: number | null;
};

export type EpubScrollStallDetectorOptions = {
  minConsecutiveSamples?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  movementThresholdPx?: number;
  offsetEpsilonPx?: number;
  topThresholdPx?: number;
};

const DEFAULT_OPTIONS: Required<EpubScrollStallDetectorOptions> = {
  minConsecutiveSamples: 3,
  minDurationMs: 150,
  maxDurationMs: 1000,
  movementThresholdPx: 4,
  offsetEpsilonPx: 1,
  topThresholdPx: 2,
};

export const getEpubScrollDirection = (
  scrollTop: number,
  previousScrollTop: number,
  epsilon = 0.5
): EpubScrollDirection => {
  const delta = scrollTop - previousScrollTop;
  if (delta < -epsilon) return "up";
  if (delta > epsilon) return "down";
  return "none";
};

export const createEpubScrollStallDetector = (
  options: EpubScrollStallDetectorOptions = {}
) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let samples: EpubScrollSample[] = [];
  let reported = false;

  const reset = () => {
    samples = [];
    reported = false;
  };

  const push = (sample: EpubScrollSample): EpubScrollStall | null => {
    const expectedUpwardMovement = sample.deltaY >= config.movementThresholdPx;
    const awayFromTop = sample.scrollTop > config.topThresholdPx;
    const noActualMovement =
      Math.abs(sample.scrollTop - sample.previousScrollTop) <=
      config.offsetEpsilonPx;
    const valid =
      expectedUpwardMovement &&
      awayFromTop &&
      sample.scrollEnabled &&
      !sample.selectionActive &&
      !sample.gestureLock &&
      noActualMovement;

    if (!valid) {
      reset();
      return null;
    }

    samples.push(sample);
    const first = samples[0];
    const durationMs = sample.timestamp - first.timestamp;
    if (durationMs > config.maxDurationMs) {
      samples = [sample];
      return null;
    }
    if (
      reported ||
      samples.length < config.minConsecutiveSamples ||
      durationMs < config.minDurationMs
    ) {
      return null;
    }

    reported = true;
    return {
      name: "epub.scroll.stall",
      direction: "up",
      scrollTop: sample.scrollTop,
      scrollHeight: sample.scrollHeight,
      clientHeight: sample.clientHeight,
      consecutiveSamples: samples.length,
      durationMs,
      deltaY: sample.deltaY,
      scrollEnabled: sample.scrollEnabled,
      selectionActive: sample.selectionActive,
      gestureLock: sample.gestureLock,
      spineIndex: sample.spineIndex,
      progress: sample.progress,
    };
  };

  return { push, reset };
};

export const createEpubScrollCheckCoordinator = (
  check: () => Promise<unknown>
) => {
  let pending: Promise<unknown> | null = null;

  const request = (): Promise<unknown> => {
    if (pending) return pending;

    let result: Promise<unknown>;
    try {
      result = Promise.resolve(check());
    } catch (error) {
      result = Promise.reject(error);
    }
    pending = result.finally(() => {
      pending = null;
    });
    return pending;
  };

  return {
    request,
    isPending: () => pending !== null,
  };
};
