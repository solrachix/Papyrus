import { describe, expect, it } from 'vitest';
import { invokeRenderPage } from './renderInvocation';

describe('render invocation telemetry boundary', () => {
  it('turns synchronous engine failures into a rejected promise', async () => {
    const error = new Error('render failed before returning a promise');
    const engine = {
      renderPage: () => {
        throw error;
      },
    };

    await expect(invokeRenderPage(engine as never, 0, 42, 1)).rejects.toBe(error);
  });
});
