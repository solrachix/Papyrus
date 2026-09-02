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

  it('forwards the optional native render telemetry context', async () => {
    const telemetry = {
      enabled: true,
      renderRequestId: 'render-1',
      surfaceId: 'page-0',
      generation: 3,
      fixture: 'large-1000',
    };
    let received: unknown;
    const engine = {
      renderPage: (...args: unknown[]) => {
        received = args[3];
        return Promise.resolve({ status: 'ready' });
      },
    };

    await invokeRenderPage(engine as never, 0, 42, 1, telemetry);
    expect(received).toEqual(telemetry);
  });
});
