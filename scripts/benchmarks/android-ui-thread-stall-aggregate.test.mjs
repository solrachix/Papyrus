import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateUiThreadStalls } from './android-ui-thread-stall-aggregate.mjs';

const nativeEvents = [
  { name: 'native.render.request', timestampNs: 1_000_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1', fixture: 'large-1000', pageIndex: 10 },
  { name: 'native.render.uiblock.enqueue', timestampNs: 1_001_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1' },
  { name: 'native.render.uiblock.start', timestampNs: 1_010_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1' },
  { name: 'native.render.uiblock.surface.resolved', timestampNs: 1_260_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1' },
  { name: 'native.render.surface.start', timestampNs: 1_261_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1' },
  { name: 'native.render.ui.post', timestampNs: 1_300_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1' },
  { name: 'native.render.ui.start', timestampNs: 1_550_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1' },
  { name: 'native.render.ready', timestampNs: 1_560_000_000, renderRequestId: 'rr-1', sampleId: 'sample-1' },
];

const perfEvents = [
  { name: 'scroll.start', sampleId: 'sample-1', fixture: 'large-1000' },
  { name: 'surface.mount', sampleId: 'sample-1', pageIndex: 10 },
  { name: 'surface.mount', sampleId: 'sample-1', pageIndex: 11 },
  { name: 'surface.unmount', sampleId: 'sample-1', pageIndex: 9 },
  { name: 'viewer.viewable', sampleId: 'sample-1', first: 10, last: 11 },
  { name: 'scroll.end', sampleId: 'sample-1' },
];

test('correlates a delayed UI runnable with UIBlock and surface activity', () => {
  const report = aggregateUiThreadStalls({
    nativeEvents,
    perfEvents,
    traceSlices: [
      { name: 'UIManagerModule.mountItems', tsNs: 1_350_000_000, durNs: 160_000_000, thread: 'main' },
      { name: 'Choreographer#doFrame', tsNs: 1_510_000_000, durNs: 35_000_000, thread: 'main' },
    ],
  });

  assert.equal(report.samples.length, 1);
  assert.equal(report.samples[0].status, 'stall');
  assert.equal(report.samples[0].uiQueueMs, 250);
  assert.equal(report.samples[0].requestToSurfaceMs, 260);
  assert.equal(report.samples[0].uiBlockMs, 250);
  assert.deepEqual(report.samples[0].surfaceActivity, { mounts: 2, unmounts: 1, viewableChanges: 1 });
  assert.equal(report.samples[0].classification, 'RN_UI_MANAGER');
  assert.equal(report.samples[0].confidence, 'HIGH');
  assert.equal(report.samples[0].topMainThreadSlices[0].name, 'UIManagerModule.mountItems');
});

test('keeps a delayed runnable inconclusive when no trace evidence is available', () => {
  const report = aggregateUiThreadStalls({ nativeEvents, perfEvents });

  assert.equal(report.samples[0].status, 'stall');
  assert.equal(report.samples[0].classification, 'INCONCLUSIVE');
  assert.equal(report.samples[0].confidence, 'LOW');
  assert.deepEqual(report.samples[0].topMainThreadSlices, []);
});

test('does not mix samples while counting stalls', () => {
  const report = aggregateUiThreadStalls({
    nativeEvents: [
      ...nativeEvents,
      { ...nativeEvents[0], renderRequestId: 'rr-2', sampleId: 'sample-2', timestampNs: 2_000_000_000 },
      { ...nativeEvents[5], renderRequestId: 'rr-2', sampleId: 'sample-2', timestampNs: 2_300_000_000 },
      { ...nativeEvents[6], renderRequestId: 'rr-2', sampleId: 'sample-2', timestampNs: 2_301_000_000 },
      { ...nativeEvents[7], renderRequestId: 'rr-2', sampleId: 'sample-2', timestampNs: 2_302_000_000 },
    ],
    perfEvents: [
      ...perfEvents,
      { name: 'surface.mount', sampleId: 'sample-2', pageIndex: 3 },
    ],
  });

  assert.equal(report.samples.length, 2);
  assert.equal(report.samples.find((sample) => sample.sampleId === 'sample-2').surfaceActivity.mounts, 1);
});
