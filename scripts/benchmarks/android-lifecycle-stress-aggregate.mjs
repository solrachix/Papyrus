import fs from 'node:fs';

const numberFrom = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const round = (value) => (value === null ? null : Math.round(value * 100) / 100);

export function parseSamples(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];

  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    const samples = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    value = samples;
  }
  const values = Array.isArray(value) ? value : value.samples;
  if (!Array.isArray(values)) throw new Error('lifecycle samples must be an array');
  return values;
}

function metricSummary(samples, key) {
  const values = samples.map((sample) => numberFrom(sample[key])).filter((value) => value !== null);
  return {
    initial: values[0] ?? null,
    peak: values.length ? Math.max(...values) : null,
    max: values.length ? Math.max(...values) : null,
    final: values.at(-1) ?? null,
    min: values.length ? Math.min(...values) : null,
  };
}

function slopePerCycle(samples, key) {
  const values = samples
    .map((sample) => ({ cycle: numberFrom(sample.cycle), value: numberFrom(sample[key]) }))
    .filter(({ cycle, value }) => cycle !== null && value !== null);
  if (values.length < 2 || values.at(-1).cycle === values[0].cycle) return null;
  return round(((values.at(-1).value - values[0].value) / 1024) / (values.at(-1).cycle - values[0].cycle));
}

function summarizeResource(samples, key) {
  const values = samples
    .map((sample) => numberFrom(sample.resources?.[key]))
    .filter((value) => value !== null);
  const monotonicGrowth = values.length >= 3 && values.every((value, index) => index === 0 || value >= values[index - 1]) && values.some((value, index) => index > 0 && value > values[index - 1]);
  return {
    initial: values[0] ?? null,
    peak: values.length ? Math.max(...values) : null,
    max: values.length ? Math.max(...values) : null,
    final: values.at(-1) ?? null,
    monotonicGrowth,
  };
}

function summarizeCounter(samples, key) {
  const values = samples
    .map((sample) => numberFrom(sample.counters?.[key]))
    .filter((value) => value !== null);
  const monotonicGrowth = values.length >= 3 && values.every((value, index) => index === 0 || value >= values[index - 1]) && values.some((value, index) => index > 0 && value > values[index - 1]);
  return {
    initial: values[0] ?? null,
    peak: values.length ? Math.max(...values) : null,
    max: values.length ? Math.max(...values) : null,
    final: values.at(-1) ?? null,
    min: values.length ? Math.min(...values) : null,
    monotonicGrowth,
  };
}

export function aggregateLifecycleStress({ scenario = 'unknown', warmupCycles = 1, samples = [] } = {}) {
  const checkpoints = samples
    .map((sample) => ({ ...sample, cycle: numberFrom(sample.cycle) }))
    .filter((sample) => sample.cycle !== null)
    .sort((left, right) => left.cycle - right.cycle);
  const postWarmup = checkpoints.filter((sample) => sample.cycle >= warmupCycles);
  const memoryKeys = ['totalPssKb', 'nativeHeapKb', 'javaHeapKb', 'graphicsKb'];
  const memory = Object.fromEntries(memoryKeys.map((key) => [key, metricSummary(checkpoints, key)]));
  const trend = Object.fromEntries(memoryKeys.map((key) => [key, { slopePerCycle: slopePerCycle(postWarmup, key) }]));
  const resourceKeys = [...new Set(checkpoints.flatMap((sample) => Object.keys(sample.resources ?? {})))];
  const resources = Object.fromEntries(resourceKeys.map((key) => [key, summarizeResource(checkpoints, key)]));
  const counterKeys = [...new Set(checkpoints.flatMap((sample) => Object.keys(sample.counters ?? {})))];
  const counters = Object.fromEntries(counterKeys.map((key) => [key, summarizeCounter(checkpoints, key)]));
  const pidSequence = checkpoints.map((sample) => numberFrom(sample.pid));
  const pids = pidSequence.filter((pid) => pid !== null);
  const pidStable = pids.length === 0
    ? null
    : pids.length === pidSequence.length && pids.every((pid) => pid === pids[0]);
  const growingResources = Object.values(resources).some((resource) => resource.monotonicGrowth);
  const pssSlope = trend.totalPssKb.slopePerCycle;
  const nativeSlope = trend.nativeHeapKb.slopePerCycle;
  const javaSlope = trend.javaHeapKb.slopePerCycle;
  const strongGrowth = pssSlope !== null && pssSlope > 5;
  const nativeGrowth = nativeSlope !== null && nativeSlope > 5;
  const javaGrowth = javaSlope !== null && javaSlope > 5;
  const enoughEvidence = postWarmup.length >= 3;
  const resourceGrowthWithMemory = growingResources && (strongGrowth || nativeGrowth || javaGrowth || (pssSlope !== null && pssSlope > 1));
  const leakSuspect = enoughEvidence && (strongGrowth || nativeGrowth || javaGrowth || resourceGrowthWithMemory);
  const classification = pidStable === false
    ? 'INCONCLUSIVE'
    : !enoughEvidence
    ? 'INCONCLUSIVE'
    : !leakSuspect
      ? 'HEALTHY'
      : nativeGrowth && javaGrowth
        ? 'MIXED'
        : resourceGrowthWithMemory
          ? 'MIXED'
          : nativeGrowth
            ? 'NATIVE_HEAP'
            : javaGrowth
              ? 'JAVA_HEAP'
              : 'INCONCLUSIVE';

  return {
    schemaVersion: 1,
    scenario,
    warmupCycles,
    checkpoints,
    memory,
    trend,
    resources,
    counters,
    pidSequence,
    pidStable,
    leakSuspect,
    classification,
    confidence: pidStable === false ? 'LOW' : enoughEvidence ? (leakSuspect ? 'MEDIUM' : 'HIGH') : 'LOW',
  };
}

if (process.argv[1] && process.argv[1].endsWith('android-lifecycle-stress-aggregate.mjs')) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('usage: node android-lifecycle-stress-aggregate.mjs SAMPLES_JSON_OR_NDJSON [OUTPUT_JSON]');
    process.exitCode = 2;
  } else {
    const args = process.argv.slice(3);
    const outputPath = args[0];
    const scenarioIndex = args.indexOf('--scenario');
    const warmupIndex = args.indexOf('--warmup-cycles');
    const scenario = scenarioIndex >= 0 ? args[scenarioIndex + 1] : 'unknown';
    const warmupCycles = warmupIndex >= 0 ? Number(args[warmupIndex + 1]) : 1;
    const report = aggregateLifecycleStress({
      scenario,
      warmupCycles: Number.isFinite(warmupCycles) ? warmupCycles : 1,
      samples: parseSamples(fs.readFileSync(inputPath, 'utf8')),
    });
    if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
