import { describe, expect, it } from 'vitest';
import { invokeRenderPage } from './renderInvocation';

describe('render invocation telemetry boundary', () => {
  it('turns synchronous engine failures into a rejected promise', async () => {
    const error = new Error('render failed before returning a promise');
    let called = false;
    const engine = {
      renderPage: () => {
        called = true;
        throw error;
      },
    };

    const result = invokeRenderPage(engine as never, 0, 42, 1);
    expect(called).toBe(true);
    await expect(result).rejects.toBe(error);
  });
});
