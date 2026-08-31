import { describe, expect, it, vi } from 'vitest';
import { createPerfSession } from './perfSession';
import { createPinchPerfMachine } from './pinchPerfSession';

function setup() {
  const events: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const session = createPerfSession({
    enabled: true,
    context: { runId: 'run', sampleId: 'sample', documentLoadId: 'doc', fixture: 'small' },
    sink: (line) => {
      const event = JSON.parse(line);
      events.push({ name: event.name, payload: event });
    },
    now: vi.fn().mockReturnValue(10),
  });
  return { events, machine: createPinchPerfMachine(session) };
}

describe('pinch performance lifecycle', () => {
  it('waits for preview clear after the single final commit', () => {
    const { events, machine } = setup();
    const gestureId = machine.begin({ startZoom: 1 });
    machine.update({ zoom: 2 });
    machine.end({ finalZoom: 2 });
    machine.commitStart();
    machine.commitEnd({ zoom: 2 });
    expect(events.map(({ name }) => name)).toEqual([
      'sample.start', 'pinch.start', 'pinch.update', 'pinch.end',
      'pinch.commit.start', 'pinch.commit.end',
    ]);
    expect(machine.completeAfterRenderReady({ zoom: 2 })).toBe(true);
    expect(events.map(({ name }) => name).slice(-2)).toEqual(['pinch.preview.cleared', 'sample.end']);
    expect(events.at(-1)?.payload.status).toBe('complete');
    expect(events.find(({ name }) => name === 'pinch.start')?.payload.gestureId).toBe(gestureId);
  });

  it('closes a no-op without a commit', () => {
    const { events, machine } = setup();
    machine.begin({ startZoom: 1 });
    machine.end({ finalZoom: 1.0005 });
    expect(events.map(({ name }) => name)).toEqual(['sample.start', 'pinch.start', 'pinch.end', 'pinch.cancelled', 'sample.end']);
    expect(events.at(-2)?.payload.reason).toBe('no-op');
    expect(events.at(-1)?.payload.status).toBe('incomplete');
  });

  it('closes an orphan before starting the next gesture', () => {
    const { events, machine } = setup();
    machine.begin({ startZoom: 1 });
    const second = machine.begin({ startZoom: 1 });
    expect(events.map(({ name }) => name)).toEqual(['sample.start', 'pinch.start', 'pinch.cancelled', 'sample.end', 'sample.start', 'pinch.start']);
    expect(events[2].payload.reason).toBe('orphaned');
    expect(second).toBe('gesture-2');
  });
});
