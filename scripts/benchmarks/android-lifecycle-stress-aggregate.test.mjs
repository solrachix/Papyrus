import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateLifecycleStress, parseSamples } from './android-lifecycle-stress-aggregate.mjs';

test('parses the NDJSON emitted by the Android runner', () => {
  assert.deepEqual(parseSamples('{"cycle":0}\n{"cycle":1}\n'), [{ cycle: 0 }, { cycle: 1 }]);
});

test('separates warm-up from a bounded post-warm-up memory trend', () => {
  const report = aggregateLifecycleStress({
    scenario: 'reopen-small',
    warmupCycles: 1,
    samples: [
      { cycle: 0, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: { attachedViews: 8, activeRenders: 1 } },
      { cycle: 1, totalPssKb: 130000, nativeHeapKb: 25000, javaHeapKb: 14000, resources: { attachedViews: 10, activeRenders: 1 } },
      { cycle: 5, totalPssKb: 132000, nativeHeapKb: 25200, javaHeapKb: 14100, resources: { attachedViews: 10, activeRenders: 0 } },
      { cycle: 10, totalPssKb: 133000, nativeHeapKb: 25300, javaHeapKb: 14200, resources: { attachedViews: 10, activeRenders: 0 } },
      { cycle: 20, totalPssKb: 133500, nativeHeapKb: 25350, javaHeapKb: 14250, resources: { attachedViews: 10, activeRenders: 0 } },
    ],
  });

  assert.equal(report.scenario, 'reopen-small');
  assert.deepEqual(report.checkpoints.map(({ cycle }) => cycle), [0, 1, 5, 10, 20]);
  assert.equal(report.memory.totalPssKb.peak, 133500);
  assert.equal(report.memory.totalPssKb.final, 133500);
  assert.ok(report.trend.totalPssKb.slopePerCycle < 1);
  assert.equal(report.resources.attachedViews.max, 10);
  assert.equal(report.classification, 'HEALTHY');
  assert.equal(report.leakSuspect, false);
});

test('does not call one noisy PSS increase a leak', () => {
  const report = aggregateLifecycleStress({
    scenario: 'single-sample',
    warmupCycles: 0,
    samples: [
      { cycle: 0, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 1, totalPssKb: 108000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
    ],
  });

  assert.equal(report.classification, 'INCONCLUSIVE');
  assert.equal(report.confidence, 'LOW');
  assert.equal(report.leakSuspect, false);
});

test('flags strong post-warm-up monotonic growth with growing resources', () => {
  const report = aggregateLifecycleStress({
    scenario: 'suspect',
    warmupCycles: 1,
    samples: [
      { cycle: 0, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: { attachedViews: 10 } },
      { cycle: 1, totalPssKb: 120000, nativeHeapKb: 25000, javaHeapKb: 14000, resources: { attachedViews: 12 } },
      { cycle: 5, totalPssKb: 160000, nativeHeapKb: 32000, javaHeapKb: 18000, resources: { attachedViews: 20 } },
      { cycle: 10, totalPssKb: 220000, nativeHeapKb: 40000, javaHeapKb: 23000, resources: { attachedViews: 30 } },
    ],
  });

  assert.equal(report.classification, 'MIXED');
  assert.equal(report.confidence, 'MEDIUM');
  assert.equal(report.leakSuspect, true);
  assert.ok(report.trend.totalPssKb.slopePerCycle > 5);
  assert.equal(report.resources.attachedViews.monotonicGrowth, true);
});

test('identifies native-only growth as native heap', () => {
  const report = aggregateLifecycleStress({
    scenario: 'native-growth',
    warmupCycles: 1,
    samples: [
      { cycle: 0, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 1, totalPssKb: 120000, nativeHeapKb: 30000, javaHeapKb: 12000, resources: {} },
      { cycle: 5, totalPssKb: 121000, nativeHeapKb: 50000, javaHeapKb: 12000, resources: {} },
      { cycle: 10, totalPssKb: 121500, nativeHeapKb: 80000, javaHeapKb: 12000, resources: {} },
    ],
  });

  assert.equal(report.classification, 'NATIVE_HEAP');
  assert.equal(report.leakSuspect, true);
});

test('identifies Java-only growth as Java heap', () => {
  const report = aggregateLifecycleStress({
    scenario: 'java-growth',
    warmupCycles: 1,
    samples: [
      { cycle: 0, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 1, totalPssKb: 120000, nativeHeapKb: 22000, javaHeapKb: 20000, resources: {} },
      { cycle: 5, totalPssKb: 121000, nativeHeapKb: 22000, javaHeapKb: 40000, resources: {} },
      { cycle: 10, totalPssKb: 121500, nativeHeapKb: 22000, javaHeapKb: 80000, resources: {} },
    ],
  });

  assert.equal(report.classification, 'JAVA_HEAP');
  assert.equal(report.leakSuspect, true);
});

test('keeps PSS-only growth inconclusive without an owner signal', () => {
  const report = aggregateLifecycleStress({
    scenario: 'pss-only-growth',
    warmupCycles: 1,
    samples: [
      { cycle: 0, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 1, totalPssKb: 120000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 5, totalPssKb: 160000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 10, totalPssKb: 220000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
    ],
  });

  assert.equal(report.classification, 'INCONCLUSIVE');
  assert.equal(report.leakSuspect, true);
});

test('does not classify a scenario as healthy when the process changes', () => {
  const report = aggregateLifecycleStress({
    scenario: 'warm-switch',
    warmupCycles: 1,
    samples: [
      { cycle: 0, pid: 100, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: { attachedViews: 2 } },
      { cycle: 1, pid: 100, totalPssKb: 100500, nativeHeapKb: 22000, javaHeapKb: 12000, resources: { attachedViews: 2 } },
      { cycle: 5, pid: 101, totalPssKb: 100400, nativeHeapKb: 22000, javaHeapKb: 12000, resources: { attachedViews: 2 } },
    ],
  });

  assert.equal(report.pidStable, false);
  assert.equal(report.classification, 'INCONCLUSIVE');
  assert.equal(report.leakSuspect, false);
});

test('missing PID checkpoint invalidates the same-process invariant', () => {
  const report = aggregateLifecycleStress({
    scenario: 'missing-pid',
    warmupCycles: 1,
    samples: [
      { cycle: 0, pid: 100, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 1, pid: null, totalPssKb: 100500, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
      { cycle: 5, pid: 100, totalPssKb: 100400, nativeHeapKb: 22000, javaHeapKb: 12000, resources: {} },
    ],
  });

  assert.deepEqual(report.pidSequence, [100, null, 100]);
  assert.equal(report.pidStable, false);
  assert.equal(report.classification, 'INCONCLUSIVE');
  assert.equal(report.confidence, 'LOW');
});

test('summarizes lifecycle ownership counters independently from heap slopes', () => {
  const report = aggregateLifecycleStress({
    scenario: 'counter-snapshot',
    warmupCycles: 1,
    samples: [
      { cycle: 0, pid: 100, totalPssKb: 100000, nativeHeapKb: 22000, javaHeapKb: 12000, counters: { engineStates: 1, renderCacheBytes: 0, activeBitmapRefs: 0, activeRenderRequests: 0, webViewCount: 0, pendingBridgeRequests: 0 } },
      { cycle: 1, pid: 100, totalPssKb: 100500, nativeHeapKb: 22000, javaHeapKb: 12000, counters: { engineStates: 1, renderCacheBytes: 4096, activeBitmapRefs: 1, activeRenderRequests: 2, webViewCount: 0, pendingBridgeRequests: 0 } },
      { cycle: 5, pid: 100, totalPssKb: 100600, nativeHeapKb: 22000, javaHeapKb: 12000, counters: { engineStates: 1, renderCacheBytes: 4096, activeBitmapRefs: 1, activeRenderRequests: 0, webViewCount: 0, pendingBridgeRequests: 0 } },
      { cycle: 10, pid: 100, totalPssKb: 100700, nativeHeapKb: 22000, javaHeapKb: 12000, counters: { engineStates: 1, renderCacheBytes: 4096, activeBitmapRefs: 1, activeRenderRequests: 0, webViewCount: 0, pendingBridgeRequests: 0 } },
    ],
  });

  assert.equal(report.counters.activeBitmapRefs.initial, 0);
  assert.equal(report.counters.activeBitmapRefs.peak, 1);
  assert.equal(report.counters.activeBitmapRefs.final, 1);
  assert.equal(report.counters.activeBitmapRefs.monotonicGrowth, true);
  assert.equal(report.counters.renderCacheBytes.peak, 4096);
  assert.equal(report.classification, 'HEALTHY');
});
