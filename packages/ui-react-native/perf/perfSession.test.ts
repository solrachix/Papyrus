import { describe, expect, it, vi } from 'vitest';
import { createPerfSession } from './perfSession';

describe('mobile performance session', () => {
  it('is completely inert when disabled', () => {
    const sink = vi.fn();
    const now = vi.fn();
    const session = createPerfSession({
      enabled: false,
      context: { runId: 'run', sampleId: 'sample', documentLoadId: 'doc', fixture: 'small' },
      sink,
      now,
    });
    session.emit('pinch.start', { gestureId: 'gesture' });
    expect(session.createId('gesture')).toBe('noop');
    expect(sink).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it('emits one correlated JSON event with monotonic timestamps', () => {
    const sink = vi.fn();
    const now = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(12);
    const session = createPerfSession({
      enabled: true,
      context: { runId: 'run', sampleId: 'sample', documentLoadId: 'doc', fixture: 'large-100' },
      sink,
      now,
    });
    const gestureId = session.createId('gesture');
    session.emit('pinch.start', { gestureId });
    session.emit('pinch.end', { gestureId });

    const first = JSON.parse(sink.mock.calls[0][0]);
    const second = JSON.parse(sink.mock.calls[1][0]);
    expect(first).toMatchObject({ name: 'pinch.start', runId: 'run', sampleId: 'sample', documentLoadId: 'doc', fixture: 'large-100', gestureId: 'gesture-1', timestamp: 10 });
    expect(second.timestamp).toBe(12);
    expect(second.timestamp).toBeGreaterThanOrEqual(first.timestamp);
  });

  it('creates unique process-local IDs by kind', () => {
    const session = createPerfSession({ enabled: true, context: { runId: 'run', sampleId: 'sample', documentLoadId: 'doc', fixture: 'small' }, sink: vi.fn(), now: () => 1 });
    expect(session.createId('gesture')).toBe('gesture-1');
    expect(session.createId('render')).toBe('render-1');
    expect(session.createId('gesture')).toBe('gesture-2');
  });
});
