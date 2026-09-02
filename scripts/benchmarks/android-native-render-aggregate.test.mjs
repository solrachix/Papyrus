import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateNativeRenderEvents } from './android-native-render-aggregate.mjs';

const renderEvents = [
  { name: 'native.render.request', timestampNs: 1_000_000, renderRequestId: 'rr-1', sampleId: 's-1', pageIndex: 4, surfaceId: 'page-4', generation: 7 },
  { name: 'native.render.surface.start', timestampNs: 1_500_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.enqueue', timestampNs: 2_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.worker.start', timestampNs: 5_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.lock.wait.start', timestampNs: 6_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.lock.acquired', timestampNs: 9_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.raster.start', timestampNs: 10_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.raster.end', timestampNs: 110_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.cache.miss', timestampNs: 111_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.cache.put', timestampNs: 115_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.ui.post', timestampNs: 120_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.ui.start', timestampNs: 130_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.install.start', timestampNs: 140_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.install.end', timestampNs: 150_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.invalidate', timestampNs: 151_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.draw.start', timestampNs: 155_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.draw.end', timestampNs: 165_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
  { name: 'native.render.ready', timestampNs: 170_000_000, renderRequestId: 'rr-1', sampleId: 's-1' },
];

test('derives native render phases from monotonic nanosecond markers', () => {
  const report = aggregateNativeRenderEvents({ events: renderEvents });
  assert.equal(report.samples.length, 1);
  assert.equal(report.samples[0].status, 'complete');
  assert.equal(report.samples[0].renderRequestId, 'rr-1');
  assert.equal(report.samples[0].requestToSurfaceMs, 0.5);
  assert.equal(report.samples[0].surfaceToEnqueueMs, 0.5);
  assert.equal(report.samples[0].queueWaitMs, 3);
  assert.equal(report.samples[0].lockWaitMs, 3);
  assert.equal(report.samples[0].rasterMs, 100);
  assert.equal(report.samples[0].postRasterMs, 10);
  assert.equal(report.samples[0].uiQueueMs, 10);
  assert.equal(report.samples[0].installMs, 10);
  assert.equal(report.samples[0].drawMs, 10);
  assert.equal(report.samples[0].requestToReadyMs, 169);
});

test('classifies cache hits without inventing raster timings', () => {
  const events = [
    { name: 'native.render.request', timestampNs: 1_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.render.surface.start', timestampNs: 2_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.render.cache.hit', timestampNs: 3_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.render.ui.start', timestampNs: 4_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.render.install.start', timestampNs: 5_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.render.install.end', timestampNs: 6_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.render.invalidate', timestampNs: 7_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.draw.start', timestampNs: 8_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.draw.end', timestampNs: 9_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
    { name: 'native.render.ready', timestampNs: 10_000_000, renderRequestId: 'rr-hit', sampleId: 's-1' },
  ];
  const report = aggregateNativeRenderEvents({ events });
  assert.equal(report.samples[0].status, 'complete');
  assert.equal(report.samples[0].cache, 'hit');
  assert.equal(report.samples[0].requestToSurfaceMs, 1);
  assert.equal(report.samples[0].surfaceToEnqueueMs, null);
  assert.equal(report.samples[0].queueWaitMs, null);
  assert.equal(report.samples[0].rasterMs, null);
  assert.equal(report.samples[0].drawMs, 1);
});

test('marks a request incomplete when a phase is duplicated or terminal is missing', () => {
  const duplicate = [...renderEvents, { ...renderEvents[1], timestampNs: 175_000_000 }];
  const duplicateReport = aggregateNativeRenderEvents({ events: duplicate });
  assert.equal(duplicateReport.samples[0].status, 'incomplete');

  const missing = renderEvents.filter((event) => event.name !== 'native.render.surface.start');
  const missingReport = aggregateNativeRenderEvents({ events: missing });
  assert.equal(missingReport.samples[0].status, 'incomplete');
});
