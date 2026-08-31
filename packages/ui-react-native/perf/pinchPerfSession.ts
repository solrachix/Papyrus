import type { PerfSession } from './perfSession';

const PINCH_EPSILON = 0.001;

type PinchPerfMachine = {
  begin: (payload: { startZoom: number; gestureId?: string }) => string;
  update: (payload: { zoom: number }) => void;
  end: (payload: { finalZoom: number }) => void;
  commitStart: () => void;
  commitEnd: (payload: { zoom: number }) => void;
  completeAfterRenderReady: (payload: { zoom: number }) => boolean;
  cancel: (reason: 'gesture-cancelled' | 'orphaned' | 'invalid' | 'no-op') => void;
};

export function createPinchPerfMachine(session: PerfSession): PinchPerfMachine {
  let active: { gestureId: string; startZoom: number; ended: boolean; committed: boolean; terminal: boolean } | null = null;

  const finishSample = (status: 'complete' | 'incomplete' | 'cancelled') => {
    if (!active || active.terminal) return;
    active.terminal = true;
    session.emit('sample.end', { sampleId: session.context.sampleId, gestureId: active.gestureId, status });
    active = null;
  };

  const cancel = (reason: 'gesture-cancelled' | 'orphaned' | 'invalid' | 'no-op') => {
    if (!active || active.terminal) return;
    session.emit('pinch.cancelled', { gestureId: active.gestureId, reason });
    finishSample(reason === 'gesture-cancelled' ? 'cancelled' : 'incomplete');
  };

  return {
    begin: ({ startZoom, gestureId }) => {
      if (active) cancel('orphaned');
      const nextGestureId = gestureId ?? session.createId('gesture');
      active = { gestureId: nextGestureId, startZoom, ended: false, committed: false, terminal: false };
      session.emit('sample.start', { sampleId: session.context.sampleId, gestureId: nextGestureId });
      session.emit('pinch.start', { gestureId: nextGestureId, startZoom });
      return nextGestureId;
    },
    update: ({ zoom }) => {
      if (!active || active.terminal) return;
      session.emit('pinch.update', { gestureId: active.gestureId, zoom });
    },
    end: ({ finalZoom }) => {
      if (!active || active.terminal || active.ended) return;
      active.ended = true;
      session.emit('pinch.end', { gestureId: active.gestureId, finalZoom });
      if (Math.abs(finalZoom - active.startZoom) < PINCH_EPSILON) cancel('no-op');
    },
    commitStart: () => {
      if (!active || active.terminal || !active.ended || active.committed) return;
      active.committed = true;
      session.emit('pinch.commit.start', { gestureId: active.gestureId });
    },
    commitEnd: ({ zoom }) => {
      if (!active || active.terminal || !active.committed) return;
      session.emit('pinch.commit.end', { gestureId: active.gestureId, zoom });
    },
    completeAfterRenderReady: ({ zoom }) => {
      if (!active || active.terminal || !active.committed) return false;
      session.emit('pinch.preview.cleared', { gestureId: active.gestureId, zoom });
      finishSample('complete');
      return true;
    },
    cancel,
  };
}
