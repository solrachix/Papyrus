import { describe, expect, it, vi } from 'vitest';
import { bootstrapFixtureLaunch } from './fixtureStartup';

describe('fixture bootstrap', () => {
  it('loads the resolved fixture once and emits verified metadata', async () => {
    const engine = {
      load: vi.fn().mockResolvedValue(undefined),
      getPageCount: vi.fn().mockReturnValue(100),
    };
    const emit = vi.fn();

    await bootstrapFixtureLaunch({
      url: 'exp+papyrus-sdk://reader?fixture=large-100&runId=run-1&sampleId=sample-1&perf=1&viewerMode=compat',
      engine,
      registry: { 'large-100': { uri: 'asset://large-100' } },
      manifest: { 'large-100': { sha256: 'hash-100', byteLength: 123, pageCount: 100 } },
      resolveAsset: (asset) => asset,
      emit,
    });

    expect(engine.load).toHaveBeenCalledWith({ uri: 'asset://large-100' });
    expect(emit.mock.calls.map(([name]) => name)).toEqual(['fixture.requested', 'fixture.loaded']);
    expect(emit).toHaveBeenLastCalledWith('fixture.loaded', expect.objectContaining({
      resolvedFixture: 'large-100',
      sha256: 'hash-100',
      byteLength: 123,
      pageCount: 100,
    }));
  });

  it('ignores warm URLs without reloading and emits the explicit event', async () => {
    const engine = { load: vi.fn(), getPageCount: vi.fn() };
    const emit = vi.fn();
    const result = await bootstrapFixtureLaunch({
      url: 'exp+papyrus-sdk://reader?fixture=large-100',
      warm: true,
      engine,
      registry: {},
      manifest: {},
      resolveAsset: (asset) => asset,
      emit,
    });
    expect(result).toMatchObject({ ignored: true });
    expect(engine.load).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('fixture.url_ignored', expect.any(Object));
  });

  it('keeps the requested fixture metadata on both sides of the load boundary', async () => {
    const engine = {
      load: vi.fn().mockResolvedValue(undefined),
      getPageCount: vi.fn().mockReturnValue(1),
    };
    const emit = vi.fn();

    await bootstrapFixtureLaunch({
      url: 'exp+papyrus-sdk://reader?fixture=small&runId=run-1&sampleId=sample-1&perf=1&viewerMode=compat',
      engine,
      registry: { small: { uri: 'asset://small' } },
      manifest: { small: { sha256: 'hash-small', byteLength: 10, pageCount: 1 } },
      resolveAsset: (asset) => asset,
      emit,
    });

    expect(emit.mock.calls[0][1]).toMatchObject({
      requestedFixture: 'small',
      resolvedFixture: 'small',
      runId: 'run-1',
      sampleId: 'sample-1',
    });
    expect(emit.mock.calls[1][1]).toMatchObject({
      requestedFixture: 'small',
      resolvedFixture: 'small',
      sha256: 'hash-small',
    });
  });
});
