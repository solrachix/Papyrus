import fs from 'node:fs';

const PHASES = [
  'native.render.request',
  'native.render.surface.start',
  'native.render.enqueue',
  'native.render.worker.start',
  'native.render.lock.wait.start',
  'native.render.lock.acquired',
  'native.render.raster.start',
  'native.render.raster.end',
  'native.render.cache.hit',
  'native.render.cache.miss',
  'native.render.cache.put',
  'native.render.cache.evict',
  'native.render.ui.post',
  'native.render.ui.start',
  'native.render.install.start',
  'native.render.install.end',
  'native.render.invalidate',
  'native.draw.start',
  'native.draw.end',
  'native.render.ready',
  'native.render.stale',
  'native.render.error',
];

const numberFrom = (value) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const durationMs = (start, end) => {
  const startNs = numberFrom(start?.timestampNs);
  const endNs = numberFrom(end?.timestampNs);
  return startNs !== null && endNs !== null && endNs >= startNs
    ? (endNs - startNs) / 1_000_000
    : null;
};

const round = (value) => (value === null ? null : Math.round(value * 100) / 100);

export function parseNativeRenderNdjson(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const marker = line.indexOf('{');
      if (marker < 0) return null;
      try {
        const event = JSON.parse(line.slice(marker));
        return PHASES.includes(event.name) ? event : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function groupByRequest(events) {
  const groups = new Map();
  for (const event of events) {
    if (!event.renderRequestId) continue;
    const list = groups.get(event.renderRequestId) ?? [];
    list.push(event);
    groups.set(event.renderRequestId, list);
  }
  return groups;
}

function firstByName(events, name) {
  return events.find((event) => event.name === name) ?? null;
}

function countByName(events, name) {
  return events.filter((event) => event.name === name).length;
}

function summarizeRequest(renderRequestId, events) {
  const request = firstByName(events, 'native.render.request');
  const ready = firstByName(events, 'native.render.ready');
  const stale = firstByName(events, 'native.render.stale');
  const error = firstByName(events, 'native.render.error');
  const cacheHit = firstByName(events, 'native.render.cache.hit');
  const cacheMiss = firstByName(events, 'native.render.cache.miss');
  const cache = cacheHit ? 'hit' : cacheMiss ? 'miss' : null;
  const phase = (name) => firstByName(events, name);
  const duplicatePhase = PHASES.find((name) => countByName(events, name) > 1);
  const hasTerminal = Boolean(ready || stale || error);
  const expected = cache === 'hit'
    ? [
        'native.render.request',
        'native.render.surface.start',
        'native.render.cache.hit',
        'native.render.ui.start',
        'native.render.install.start',
        'native.render.install.end',
        'native.render.invalidate',
        'native.draw.start',
        'native.draw.end',
        'native.render.ready',
      ]
    : [
        'native.render.request',
        'native.render.surface.start',
        'native.render.enqueue',
        'native.render.worker.start',
        'native.render.raster.start',
        'native.render.raster.end',
        'native.render.cache.put',
        'native.render.ui.post',
        'native.render.ui.start',
        'native.render.install.start',
        'native.render.install.end',
        'native.render.invalidate',
        'native.draw.start',
        'native.draw.end',
        'native.render.ready',
      ];
  const missingPhase = expected.find((name) => !phase(name));
  const lockWaitStart = phase('native.render.lock.wait.start');
  const lockAcquired = phase('native.render.lock.acquired');
  const complete = Boolean(
    request && ready && cache && hasTerminal && !duplicatePhase && !missingPhase
  );

  return {
    status: complete ? 'complete' : 'incomplete',
    renderRequestId,
    sampleId: request?.sampleId ?? events.find((event) => event.sampleId)?.sampleId ?? null,
    documentLoadId: request?.documentLoadId ?? null,
    fixture: request?.fixture ?? null,
    pageIndex: request?.pageIndex ?? null,
    surfaceId: request?.surfaceId ?? null,
    generation: request?.generation ?? null,
    cache,
    requestToSurfaceMs: round(durationMs(request, phase('native.render.surface.start'))),
    surfaceToEnqueueMs: round(durationMs(phase('native.render.surface.start'), phase('native.render.enqueue'))),
    queueWaitMs: round(durationMs(phase('native.render.enqueue'), phase('native.render.worker.start'))),
    lockWaitMs: round(durationMs(lockWaitStart, lockAcquired)),
    rasterMs: round(durationMs(phase('native.render.raster.start'), phase('native.render.raster.end'))),
    postRasterMs: round(durationMs(phase('native.render.raster.end'), phase('native.render.ui.post'))),
    uiQueueMs: round(durationMs(phase('native.render.ui.post'), phase('native.render.ui.start'))),
    installMs: round(durationMs(phase('native.render.install.start'), phase('native.render.install.end'))),
    drawMs: round(durationMs(phase('native.draw.start'), phase('native.draw.end'))),
    requestToReadyMs: round(durationMs(request, ready)),
    terminal: ready ? 'ready' : stale ? 'stale' : error ? 'error' : null,
    validation: {
      missingPhase: missingPhase ?? null,
      duplicatePhase: duplicatePhase ?? null,
      terminalCount: Number(hasTerminal),
    },
  };
}

const nearestRank = (values, percentile) => {
  const sorted = values.filter((value) => numberFrom(value) !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentile * sorted.length) - 1))];
};

function aggregateByKey(samples) {
  const groups = new Map();
  for (const sample of samples) {
    const key = `${sample.fixture ?? 'unknown'}:${sample.cache ?? 'unknown'}`;
    const list = groups.get(key) ?? [];
    list.push(sample);
    groups.set(key, list);
  }
  const aggregates = {};
  const metric = (list, key) => {
    const values = list.filter((sample) => sample.status === 'complete').map((sample) => sample[key]).filter((value) => numberFrom(value) !== null);
    return {
      validN: values.length,
      p50: nearestRank(values, 0.5),
      p90: nearestRank(values, 0.9),
      p95: nearestRank(values, 0.95),
      max: values.length ? Math.max(...values) : null,
    };
  };
  for (const [key, list] of groups) {
    aggregates[key] = {
      fixture: list[0].fixture,
      cache: list[0].cache,
      totalN: list.length,
      validN: list.filter((sample) => sample.status === 'complete').length,
      metrics: Object.fromEntries(['requestToSurfaceMs', 'surfaceToEnqueueMs', 'queueWaitMs', 'lockWaitMs', 'rasterMs', 'postRasterMs', 'uiQueueMs', 'installMs', 'drawMs', 'requestToReadyMs'].map((name) => [name, metric(list, name)])),
    };
  }
  return aggregates;
}

export function aggregateNativeRenderEvents({ events = [], ndjson = '' } = {}) {
  const parsed = events.length ? events : parseNativeRenderNdjson(ndjson);
  const samples = [...groupByRequest(parsed)].map(([renderRequestId, requestEvents]) => summarizeRequest(renderRequestId, requestEvents));
  return {
    schemaVersion: 1,
    samples,
    aggregates: aggregateByKey(samples),
    completeN: samples.filter((sample) => sample.status === 'complete').length,
    incompleteN: samples.filter((sample) => sample.status !== 'complete').length,
  };
}

if (process.argv[1] && process.argv[1].endsWith('android-native-render-aggregate.mjs')) {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: node android-native-render-aggregate.mjs EVENTS_NDJSON [OUTPUT_JSON]');
    process.exitCode = 2;
  } else {
    const report = aggregateNativeRenderEvents({ ndjson: fs.readFileSync(input, 'utf8') });
    const output = process.argv[3];
    if (output) fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
