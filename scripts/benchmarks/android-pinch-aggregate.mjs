import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT_NAMES = new Set([
  'fixture.requested', 'fixture.loaded', 'fixture.invalid', 'fixture.url_ignored', 'viewer.mode',
  'pinch.start', 'pinch.update', 'pinch.end', 'pinch.commit.start', 'pinch.commit.end',
  'render.request', 'render.start', 'render.end', 'render.ready', 'render.stale', 'render.abandoned', 'render.error', 'render.cancelled', 'surface.swap',
  'pinch.preview.cleared', 'sample.start', 'sample.end', 'pinch.cancelled',
]);

const numberFrom = (value) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

export function parseNdjson(text) {
  return String(text ?? '').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

export function parseGfxInfo(text) {
  const value = String(text ?? '');
  const matchNumber = (pattern) => {
    const match = value.match(pattern);
    return match ? Number(match[1]) : null;
  };
  const percentile = (percent) => matchNumber(new RegExp(`${percent}th percentile:\\s*([0-9.]+)ms`));
  return {
    frames: matchNumber(/Total frames rendered:\s*(\d+)/),
    jankyFrames: matchNumber(/Janky frames:\s*(\d+)/),
    missedVsync: matchNumber(/Number Missed Vsync:\s*(\d+)/),
    framePercentilesMs: { p50: percentile(50), p90: percentile(90), p95: percentile(95) },
  };
}

const nearestRank = (values, p) => {
  const sorted = values.filter(numberFrom).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
};

function groupBySample(events) {
  const groups = new Map();
  for (const event of events) {
    if (!EVENT_NAMES.has(event.name) || !event.sampleId) continue;
    const list = groups.get(event.sampleId) ?? [];
    list.push(event);
    groups.set(event.sampleId, list);
  }
  return groups;
}

function event(list, name) { return list.find((item) => item.name === name); }
function events(list, name) { return list.filter((item) => item.name === name); }

function summarizeSample(sampleId, list, gfxinfo, environment, hasGfxInfo) {
  const start = event(list, 'pinch.start');
  const end = event(list, 'pinch.end');
  const commitStart = event(list, 'pinch.commit.start');
  const commitEnd = event(list, 'pinch.commit.end');
  const cleared = event(list, 'pinch.preview.cleared');
  const gestureId = start?.gestureId;
  const renderEvents = list.filter((item) => item.name.startsWith('render.') && item.gestureId === gestureId);
  const readyEvents = renderEvents.filter((item) => item.name === 'render.ready');
  const ready = [...readyEvents].reverse().find((item) => cleared && item.timestamp <= cleared.timestamp) ?? readyEvents[readyEvents.length - 1];
  const renderRequests = renderEvents.filter((item) => item.name === 'render.request');
  const request = renderRequests.find((item) => item.renderRequestId === ready?.renderRequestId) ?? renderRequests[0];
  const renderStart = request ? renderEvents.find((item) => item.name === 'render.start' && item.renderRequestId === request.renderRequestId) : null;
  const renderEnd = request ? renderEvents.find((item) => item.name === 'render.end' && item.renderRequestId === request.renderRequestId) : null;
  const surfaceSwap = request ? list.find((item) => item.name === 'surface.swap' && item.renderRequestId === request.renderRequestId) : null;
  const sampleStart = event(list, 'sample.start');
  const sampleEnd = event(list, 'sample.end');
  const mode = event(list, 'viewer.mode');
  const fixtureRequested = event(list, 'fixture.requested');
  const fixtureLoaded = event(list, 'fixture.loaded');
  const fixture = fixtureLoaded ?? fixtureRequested ?? list.find((item) => item.fixture);
  const sampleStarts = events(list, 'sample.start');
  const sampleEnds = events(list, 'sample.end');
  const pinchStarts = events(list, 'pinch.start');
  const pinchEnds = events(list, 'pinch.end');
  const commitStarts = events(list, 'pinch.commit.start');
  const commitEnds = events(list, 'pinch.commit.end');
  const requests = renderRequests;
  const readies = renderEvents.filter((item) => item.name === 'render.ready');
  const clears = events(list, 'pinch.preview.cleared');
  const terminalNames = new Set(['render.ready', 'render.stale', 'render.abandoned', 'render.error', 'render.cancelled']);
  const renderLifecycleValid = requests.length >= 1 && requests.every((requestItem) => {
    const terminals = renderEvents.filter((item) =>
      terminalNames.has(item.name) && item.renderRequestId === requestItem.renderRequestId
    );
    return terminals.length === 1;
  });
  const finalZoom = numberFrom(end?.finalZoom);
  const startZoom = numberFrom(start?.startZoom);
  const direction = startZoom !== null && finalZoom !== null && finalZoom > startZoom ? 'out' : 'in';
  const fixtureContractComplete = Boolean(
    fixtureRequested && fixtureLoaded &&
    fixtureRequested.requestedFixture === fixtureLoaded.requestedFixture &&
    fixtureRequested.resolvedFixture === fixtureLoaded.resolvedFixture &&
    fixtureRequested.requestedFixture === fixtureRequested.resolvedFixture &&
    fixtureLoaded.sha256 && fixtureLoaded.pageCount
  );
  const complete = Boolean(
    sampleStarts.length === 1 && sampleEnds.length === 1 && pinchStarts.length === 1 &&
    pinchEnds.length === 1 && commitStarts.length === 1 && commitEnds.length === 1 &&
    requests.length >= 1 && readies.length >= 1 && clears.length === 1 &&
    sampleStart && sampleEnd?.status === 'complete' && mode?.mode === 'compat' && fixtureContractComplete &&
    start?.gestureId && end?.gestureId === start.gestureId && commitStart?.gestureId === start.gestureId &&
    commitEnd?.gestureId === start.gestureId && request?.gestureId === start.gestureId &&
    ready?.renderRequestId === request.renderRequestId && cleared?.gestureId === start.gestureId &&
    renderLifecycleValid &&
    (!hasGfxInfo || (numberFrom(environment.gfxWindowDurationMs) ?? 0) > 0) &&
    renderEvents.every((item) => !item.documentLoadId || !start.documentLoadId || item.documentLoadId === start.documentLoadId)
  );
  const sampleDurationMs = numberFrom(sampleEnd?.timestamp) !== null && numberFrom(sampleStart?.timestamp) !== null
    ? sampleEnd.timestamp - sampleStart.timestamp : null;
  const gestureDurationMs = start && end ? end.timestamp - start.timestamp : null;
  const commitDurationMs = commitStart && commitEnd ? commitEnd.timestamp - commitStart.timestamp : null;
  const frameData = gfxinfo ?? {};
  const gfxWindowDurationMs = numberFrom(environment.gfxWindowDurationMs);
  const frameDurationMs = gfxWindowDurationMs ?? (!hasGfxInfo ? numberFrom(sampleDurationMs) : null);
  const frames = numberFrom(frameData.frames);
  return {
    sampleId,
    fixture: fixture?.resolvedFixture ?? fixture?.fixture ?? null,
    requestedFixture: fixtureRequested?.requestedFixture ?? null,
    fixtureSha256: fixture?.sha256 ?? null,
    direction,
    status: complete ? 'complete' : sampleEnd?.status === 'cancelled' ? 'cancelled' : 'incomplete',
    runId: sampleStart?.runId ?? null,
    gestureId: start?.gestureId ?? null,
    documentLoadId: start?.documentLoadId ?? null,
    durationMs: sampleDurationMs,
    sampleDurationMs,
    gfxWindowDurationMs,
    gestureDurationMs,
    fps: frames !== null && frameDurationMs > 0 ? frames / (frameDurationMs / 1000) : null,
    frames,
    jankyFrames: numberFrom(frameData.jankyFrames),
    jankyPercent: frames && numberFrom(frameData.jankyFrames) !== null ? (frameData.jankyFrames / frames) * 100 : null,
    framePercentilesMs: frameData.framePercentilesMs ?? { p50: null, p90: null, p95: null },
    missedVsync: numberFrom(frameData.missedVsync),
    commitDurationMs,
    commitToRequestMs: commitEnd && request ? request.timestamp - commitEnd.timestamp : null,
    requestToReadyMs: request && ready ? ready.timestamp - request.timestamp : null,
    commitToReadyMs: commitEnd && ready ? ready.timestamp - commitEnd.timestamp : null,
    renderStartToEndMs: renderStart && renderEnd ? renderEnd.timestamp - renderStart.timestamp : null,
    renderEndToSurfaceSwapMs: renderEnd && surfaceSwap ? surfaceSwap.timestamp - renderEnd.timestamp : null,
    renderTarget: request ? {
      layoutWidth: numberFrom(request.layoutWidth),
      layoutHeight: numberFrom(request.layoutHeight),
      renderScale: numberFrom(request.renderScale),
      estimatedTargetPixels: numberFrom(request.estimatedTargetPixels),
    } : null,
    readyToPreviewClearedMs: ready && cleared ? cleared.timestamp - ready.timestamp : null,
    renderLifecycleValid,
    renderTerminals: Object.fromEntries(['ready', 'stale', 'abandoned', 'error', 'cancelled'].map((status) => [`${status}`, renderEvents.filter((item) => item.name === `render.${status}`).length])),
    environment,
    rawEventCount: list.length,
  };
}

function aggregateSamples(samples) {
  const grouped = new Map();
  for (const sample of samples) {
    const key = `${sample.fixture}:${sample.direction}`;
    const list = grouped.get(key) ?? [];
    list.push(sample);
    grouped.set(key, list);
  }
  const aggregates = {};
  const metric = (list, selector) => {
    const values = list.filter((sample) => sample.status === 'complete').map(selector).filter(numberFrom);
    return { validN: values.length, p50: nearestRank(values, 0.5), p90: nearestRank(values, 0.9), p95: nearestRank(values, 0.95), max: values.length ? Math.max(...values) : null };
  };
  for (const [key, list] of grouped) {
    const valid = list.filter((sample) => sample.status === 'complete');
    aggregates[key] = {
      fixture: list[0].fixture,
      direction: list[0].direction,
      validN: valid.length,
      totalN: list.length,
      metrics: {
        durationMs: metric(list, (sample) => sample.durationMs),
        fps: metric(list, (sample) => sample.fps),
        jankyPercent: metric(list, (sample) => sample.jankyPercent),
        commitToReadyMs: metric(list, (sample) => sample.commitToReadyMs),
        requestToReadyMs: metric(list, (sample) => sample.requestToReadyMs),
        renderStartToEndMs: metric(list, (sample) => sample.renderStartToEndMs),
        renderEndToSurfaceSwapMs: metric(list, (sample) => sample.renderEndToSurfaceSwapMs),
      },
    };
  }
  return aggregates;
}

export function validateAndroidPinchReport(report, { fixtures, minimumValid = 1 } = {}) {
  const selectedFixtures = fixtures?.length
    ? fixtures
    : [...new Set(report.samples.map((sample) => sample.fixture).filter(Boolean))];
  const failures = [];
  for (const fixture of selectedFixtures) {
    for (const direction of ['in', 'out']) {
      const key = `${fixture}:${direction}`;
      const aggregate = report.aggregates[key];
      if (!aggregate || aggregate.validN < minimumValid) {
        failures.push(`${key} requires ${minimumValid} valid samples, got ${aggregate?.validN ?? 0}`);
      }
      for (const sample of report.samples.filter((item) => item.fixture === fixture && item.direction === direction)) {
        if (sample.status === 'complete' && sample.requestedFixture !== fixture) {
          failures.push(`${sample.sampleId} requested ${sample.requestedFixture}, expected ${fixture}`);
        }
      }
    }
  }
  if (failures.length) throw new Error(failures.join('; '));
  return true;
}

export function aggregateAndroidPinch({ ndjson, gfxinfo = '', environment = {} }) {
  const rawEvents = parseNdjson(ndjson);
  const parsedGfx = parseGfxInfo(gfxinfo);
  const samples = [...groupBySample(rawEvents)].map(([sampleId, list]) => summarizeSample(sampleId, list, parsedGfx, environment, Boolean(String(gfxinfo ?? '').trim())));
  return { schemaVersion: 1, environment, rawEvents, samples, aggregates: aggregateSamples(samples) };
}

export function aggregateAndroidPinchDirectory(rootDir) {
  const samples = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      if (entry.isFile() && entry.name === 'events.ndjson') {
        const gfxPath = path.join(directory, 'gfxinfo.txt');
        const metadataPath = path.join(directory, 'metadata.txt');
        const environment = fs.existsSync(metadataPath) ? parseMetadata(fs.readFileSync(metadataPath, 'utf8')) : {};
        const report = aggregateAndroidPinch({ ndjson: fs.readFileSync(fullPath, 'utf8'), gfxinfo: fs.existsSync(gfxPath) ? fs.readFileSync(gfxPath, 'utf8') : '', environment });
        samples.push(...report.samples);
      }
    }
  };
  walk(rootDir);
  return { schemaVersion: 1, environment: { rootDir }, rawEvents: [], samples, aggregates: aggregateSamples(samples) };
}

function parseMetadata(text) {
  return Object.fromEntries(String(text ?? '').split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf('=');
    return separator === -1 ? [line, true] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  const report = fs.statSync(input).isDirectory()
    ? aggregateAndroidPinchDirectory(input)
    : aggregateAndroidPinch({ ndjson: fs.readFileSync(input, 'utf8'), gfxinfo: process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : '' });
  const minValidIndex = process.argv.indexOf('--min-valid');
  if (minValidIndex !== -1) {
    const fixturesIndex = process.argv.indexOf('--fixtures');
    const fixtures = fixturesIndex === -1 ? undefined : process.argv[fixturesIndex + 1].split(',').filter(Boolean);
    validateAndroidPinchReport(report, {
      fixtures,
      minimumValid: Number(process.argv[minValidIndex + 1]),
    });
  }
  console.log(JSON.stringify(report, null, 2));
}
