import fs from 'node:fs';

const NATIVE_NAMES = new Set([
  'native.render.request',
  'native.render.uiblock.enqueue',
  'native.render.uiblock.start',
  'native.render.uiblock.surface.resolved',
  'native.render.ui.post',
  'native.render.ui.start',
]);

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

function parseNdjson(text, predicate = () => true) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const marker = line.indexOf('{');
      if (marker < 0) return null;
      try {
        const event = JSON.parse(line.slice(marker));
        return predicate(event) ? event : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function parseNativeUiThreadNdjson(text) {
  return parseNdjson(text, (event) => NATIVE_NAMES.has(event.name));
}

export function parsePerfNdjson(text) {
  return parseNdjson(text, (event) => typeof event.name === 'string');
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

function sampleEvents(perfEvents, sampleId) {
  return perfEvents.filter((event) => event.sampleId === sampleId);
}

function countEvent(events, name) {
  return events.filter((event) => event.name === name).length;
}

function traceWindowSlices(traceSlices, post, start) {
  const startNs = numberFrom(post?.timestampNs);
  const endNs = numberFrom(start?.timestampNs);
  if (startNs === null || endNs === null) return [];

  return traceSlices
    .filter((slice) => {
      const sliceStart = numberFrom(slice.tsNs);
      const sliceDuration = numberFrom(slice.durNs);
      if (sliceStart === null || sliceDuration === null) return false;
      const sliceEnd = sliceStart + Math.max(0, sliceDuration);
      return (slice.thread ?? 'main') === 'main' && sliceStart < endNs && sliceEnd > startNs;
    })
    .map((slice) => ({
      name: String(slice.name ?? 'unknown'),
      durationMs: round((numberFrom(slice.durNs) ?? 0) / 1_000_000),
      thread: slice.thread ?? 'main',
    }))
    .sort((left, right) => (right.durationMs ?? 0) - (left.durationMs ?? 0))
    .slice(0, 5);
}

function classifySlices(slices, uiQueueMs) {
  const categoryDurations = new Map();
  for (const slice of slices) {
    let category = null;
    if (/UIManager|mountItems|mountItem|createView|manageChildren|Fabric/i.test(slice.name)) {
      category = 'RN_UI_MANAGER';
    } else if (/performTraversals|ViewRootImpl|measure|layout/i.test(slice.name)) {
      category = 'VIEW_TRAVERSAL';
    } else if (/GC_FOR_ALLOC|concurrent GC|GC pause|heap trim/i.test(slice.name)) {
      category = 'GC';
    } else if (/React|JS|Hermes/i.test(slice.name)) {
      category = 'JS_COMMIT';
    } else if (/RenderThread|GPU|fence/i.test(slice.name)) {
      category = 'RENDER_THREAD_GPU';
    } else if (/Binder|system_server|Choreographer/i.test(slice.name)) {
      category = 'SYSTEM_MAIN_THREAD';
    }
    if (category) categoryDurations.set(category, (categoryDurations.get(category) ?? 0) + (slice.durationMs ?? 0));
  }

  if (categoryDurations.size === 0) return { classification: 'INCONCLUSIVE', confidence: 'LOW' };

  const ranked = [...categoryDurations.entries()].sort((left, right) => right[1] - left[1]);
  const totalDuration = ranked.reduce((sum, [, duration]) => sum + duration, 0);
  if (ranked.length > 1 && ranked[0][1] < totalDuration * 0.6) {
    return { classification: 'MIXED', confidence: 'MEDIUM' };
  }

  const largest = slices[0]?.durationMs ?? 0;
  return {
    classification: ranked[0][0],
    confidence: largest >= uiQueueMs * 0.5 ? 'HIGH' : 'MEDIUM',
  };
}

function summarizeRequest(renderRequestId, events, perfEvents, traceSlices) {
  const request = firstByName(events, 'native.render.request');
  const uiPost = firstByName(events, 'native.render.ui.post');
  const uiStart = firstByName(events, 'native.render.ui.start');
  const uiQueueMs = round(durationMs(uiPost, uiStart));
  const sampleId = request?.sampleId ?? events.find((event) => event.sampleId)?.sampleId ?? null;
  const samplePerfEvents = sampleEvents(perfEvents, sampleId);
  const topMainThreadSlices = traceWindowSlices(traceSlices, uiPost, uiStart);
  const classification = classifySlices(topMainThreadSlices, uiQueueMs ?? 0);
  const status = uiQueueMs !== null && uiQueueMs > 100 ? 'stall' : 'normal';
  const surfaceResolved = firstByName(events, 'native.render.uiblock.surface.resolved');
  const uiBlockStart = firstByName(events, 'native.render.uiblock.start');
  const uiBlockEnqueue = firstByName(events, 'native.render.uiblock.enqueue');

  return {
    status,
    renderRequestId,
    sampleId,
    fixture: request?.fixture ?? samplePerfEvents.find((event) => event.fixture)?.fixture ?? null,
    pageIndex: request?.pageIndex ?? null,
    uiQueueMs,
    requestToSurfaceMs: round(durationMs(request, surfaceResolved)),
    uiBlockMs: round(durationMs(uiBlockStart, surfaceResolved)),
    uiBlockQueueMs: round(durationMs(uiBlockEnqueue, uiBlockStart)),
    surfaceActivity: {
      mounts: countEvent(samplePerfEvents, 'surface.mount'),
      unmounts: countEvent(samplePerfEvents, 'surface.unmount'),
      viewableChanges: countEvent(samplePerfEvents, 'viewer.viewable'),
    },
    topMainThreadSlices,
    classification: status === 'stall' ? classification.classification : null,
    confidence: status === 'stall' ? classification.confidence : null,
  };
}

export function aggregateUiThreadStalls({ nativeEvents = [], perfEvents = [], traceSlices = [], nativeNdjson = '', perfNdjson = '' } = {}) {
  const parsedNative = nativeEvents.length ? nativeEvents : parseNativeUiThreadNdjson(nativeNdjson);
  const parsedPerf = perfEvents.length ? perfEvents : parsePerfNdjson(perfNdjson);
  const samples = [...groupByRequest(parsedNative)].map(([requestId, events]) =>
    summarizeRequest(requestId, events, parsedPerf, traceSlices)
  );
  const stalls = samples.filter((sample) => sample.status === 'stall');

  return {
    schemaVersion: 1,
    samples,
    stalls,
    stallN: stalls.length,
    completeN: samples.filter((sample) => sample.uiQueueMs !== null).length,
  };
}

if (process.argv[1] && process.argv[1].endsWith('android-ui-thread-stall-aggregate.mjs')) {
  const nativePath = process.argv[2];
  const perfPath = process.argv[3];
  const tracePath = process.argv[4];
  if (!nativePath) {
    console.error('usage: node android-ui-thread-stall-aggregate.mjs NATIVE_NDJSON [PERF_NDJSON] [TRACE_JSON] [OUTPUT_JSON]');
    process.exitCode = 2;
  } else {
    const outputPath = process.argv[5];
    const report = aggregateUiThreadStalls({
      nativeNdjson: fs.readFileSync(nativePath, 'utf8'),
      perfNdjson: perfPath ? fs.readFileSync(perfPath, 'utf8') : '',
      traceSlices: tracePath ? JSON.parse(fs.readFileSync(tracePath, 'utf8')) : [],
    });
    if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
