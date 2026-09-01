import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateAndroidPinch, aggregateAndroidPinchDirectory, parseGfxInfo, validateAndroidPinchReport } from './android-pinch-aggregate.mjs';

const events = [
  { name: 'sample.start', timestamp: 100, sampleId: 's1', fixture: 'small', runId: 'r1' },
  { name: 'fixture.requested', timestamp: 101, sampleId: 's1', fixture: 'small', requestedFixture: 'small', resolvedFixture: 'small', runId: 'r1' },
  { name: 'fixture.loaded', timestamp: 102, sampleId: 's1', fixture: 'small', requestedFixture: 'small', resolvedFixture: 'small', sha256: 'fixture-hash', byteLength: 10, pageCount: 1, runId: 'r1' },
  { name: 'viewer.mode', timestamp: 103, sampleId: 's1', fixture: 'small', mode: 'compat' },
  { name: 'pinch.start', timestamp: 110, sampleId: 's1', fixture: 'small', gestureId: 'g1', startZoom: 1 },
  { name: 'pinch.end', timestamp: 210, sampleId: 's1', fixture: 'small', gestureId: 'g1', finalZoom: 2 },
  { name: 'pinch.commit.start', timestamp: 211, sampleId: 's1', fixture: 'small', gestureId: 'g1' },
  { name: 'pinch.commit.end', timestamp: 212, sampleId: 's1', fixture: 'small', gestureId: 'g1', zoom: 2 },
  { name: 'render.request', timestamp: 213, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr1', surfaceId: 'page-0', pageIndex: 0, zoom: 2, generation: 2, renderScale: 2, layoutWidth: 100, layoutHeight: 200, estimatedTargetPixels: 160000 },
  { name: 'render.start', timestamp: 214, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr1', surfaceId: 'page-0', pageIndex: 0, zoom: 2, generation: 2, renderScale: 2 },
  { name: 'render.end', timestamp: 259, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr1', surfaceId: 'page-0', pageIndex: 0, zoom: 2, generation: 2, status: 'ready' },
  { name: 'render.ready', timestamp: 260, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr1', surfaceId: 'page-0', pageIndex: 0, zoom: 2, generation: 2 },
  { name: 'pinch.preview.cleared', timestamp: 270, sampleId: 's1', fixture: 'small', gestureId: 'g1', zoom: 2 },
  { name: 'sample.end', timestamp: 271, sampleId: 's1', fixture: 'small', gestureId: 'g1', status: 'complete' },
];

test('parses gfxinfo frame and vsync counters', () => {
  const parsed = parseGfxInfo('Total frames rendered: 40\nJanky frames: 5 (12.5%)\nNumber Missed Vsync: 2\n50th percentile: 8ms\n90th percentile: 24ms\n95th percentile: 31ms');
  assert.deepEqual(parsed, { frames: 40, jankyFrames: 5, missedVsync: 2, framePercentilesMs: { p50: 8, p90: 24, p95: 31 } });
});

test('correlates one complete sample and aggregates it by direction', () => {
  const report = aggregateAndroidPinch({ ndjson: `${events.map(JSON.stringify).join('\n')}\n`, gfxinfo: 'Total frames rendered: 40\nJanky frames: 5 (12.5%)\nNumber Missed Vsync: 2\n50th percentile: 8ms\n90th percentile: 24ms\n95th percentile: 31ms', environment: { device: 'Pixel7Clean', gfxWindowDurationMs: 250 } });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.samples.length, 1);
  assert.equal(report.samples[0].direction, 'out');
  assert.equal(report.samples[0].fps, 40 / 0.25);
  assert.equal(report.samples[0].sampleDurationMs, 171);
  assert.equal(report.samples[0].gfxWindowDurationMs, 250);
  assert.equal(report.aggregates['small:out'].totalN, 1);
  assert.equal(report.aggregates['small:out'].validN, 1);
  assert.equal(report.aggregates['small:out'].metrics.commitToReadyMs.p90, 48);
  assert.equal(report.aggregates['small:out'].metrics.renderStartToEndMs.p90, 45);
});

test('keeps render phases correlated to the committed request', () => {
  const report = aggregateAndroidPinch({ ndjson: `${events.map(JSON.stringify).join('\n')}\n`, gfxinfo: '', environment: {} });
  assert.equal(report.samples[0].renderStartToEndMs, 45);
  assert.equal(report.samples[0].renderTarget.renderScale, 2);
});

test('excludes duplicate commits and incomplete samples from percentiles', () => {
  const invalid = [
    ...events,
    { ...events.find((event) => event.name === 'pinch.commit.start'), timestamp: 212.5 },
  ];
  const report = aggregateAndroidPinch({ ndjson: invalid.map(JSON.stringify).join('\n'), gfxinfo: '', environment: {} });
  assert.equal(report.samples[0].status, 'incomplete');
  assert.equal(report.aggregates['small:out'].validN, 0);
  assert.equal(report.aggregates['small:out'].totalN, 1);
});

test('accepts abandoned intermediate renders and correlates the ready request', () => {
  const withIntermediateRender = [
    ...events.slice(0, 6),
    { name: 'render.request', timestamp: 212.5, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr0', surfaceId: 'page-0', pageIndex: 0, zoom: 2, generation: 2 },
    { name: 'render.abandoned', timestamp: 214, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr0', surfaceId: 'page-0', pageIndex: 0, generation: 2 },
    ...events.slice(6),
    { name: 'render.ready', timestamp: 280, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr-after', surfaceId: 'page-1', pageIndex: 1, zoom: 2, generation: 2 },
  ];
  const report = aggregateAndroidPinch({ ndjson: withIntermediateRender.map(JSON.stringify).join('\n'), gfxinfo: '' });
  assert.equal(report.samples[0].status, 'complete');
  assert.equal(report.samples[0].requestToReadyMs, 47);
  assert.equal(report.samples[0].renderTerminals.abandoned, 1);
});

test('requires exactly one terminal for every render request', () => {
  const missingTerminal = [
    ...events,
    { name: 'render.request', timestamp: 214, sampleId: 's1', fixture: 'small', gestureId: 'g1', renderRequestId: 'rr-missing', surfaceId: 'page-0', pageIndex: 0, zoom: 2, generation: 2 },
  ];
  const report = aggregateAndroidPinch({ ndjson: missingTerminal.map(JSON.stringify).join('\n'), gfxinfo: '', environment: { gfxWindowDurationMs: 250 } });
  assert.equal(report.samples[0].status, 'incomplete');
});

test('requires the gfx window for a valid frame-rate sample', () => {
  const report = aggregateAndroidPinch({ ndjson: events.map(JSON.stringify).join('\n'), gfxinfo: 'Total frames rendered: 40\nJanky frames: 5', environment: {} });
  assert.equal(report.samples[0].status, 'incomplete');
  assert.equal(report.samples[0].fps, null);
});

test('aggregates the per-sample directory without mixing gfxinfo windows', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'papyrus-pr15-runs-'));
  const sample = join(root, 'small', 'out', '1');
  await mkdir(sample, { recursive: true });
  await writeFile(join(sample, 'events.ndjson'), events.map(JSON.stringify).join('\n'));
  await writeFile(join(sample, 'gfxinfo.txt'), 'Total frames rendered: 3\nJanky frames: 1');
  await writeFile(join(sample, 'metadata.txt'), 'fixture=small\ndirection=out\ngfxWindowDurationMs=125\n');
  const report = aggregateAndroidPinchDirectory(root);
  assert.equal(report.samples.length, 1);
  assert.equal(report.samples[0].frames, 3);
  assert.equal(report.samples[0].gfxWindowDurationMs, 125);
});

test('rejects a report until every selected fixture and direction has enough valid samples', () => {
  const report = aggregateAndroidPinch({ ndjson: events.map(JSON.stringify).join('\n'), gfxinfo: '' });
  assert.throws(
    () => validateAndroidPinchReport(report, { fixtures: ['small'], minimumValid: 2 }),
    /small:out requires 2 valid samples, got 1/
  );
});
