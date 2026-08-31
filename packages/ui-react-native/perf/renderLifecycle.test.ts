import { describe, expect, it } from 'vitest';
import { createRenderLifecycle } from './renderLifecycle';

describe('render lifecycle', () => {
  it('accepts one terminal state only', () => {
    const lifecycle = createRenderLifecycle();
    expect(lifecycle.complete('ready')).toBe(true);
    expect(lifecycle.complete('stale')).toBe(false);
    expect(lifecycle.terminal).toBe('ready');
  });

  it('maps cleanup to abandoned and never to confirmed cancellation', () => {
    const lifecycle = createRenderLifecycle();
    expect(lifecycle.abandon('unmount')).toBe(true);
    expect(lifecycle.complete('cancelled')).toBe(false);
    expect(lifecycle.terminal).toBe('abandoned');
  });

  it('does not emit a second terminal after a late promise', () => {
    const lifecycle = createRenderLifecycle();
    lifecycle.abandon('superseded');
    expect(lifecycle.complete('ready')).toBe(false);
    expect(lifecycle.complete('error')).toBe(false);
  });
});
