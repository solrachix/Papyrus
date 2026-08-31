import { describe, expect, it } from 'vitest';
import { parsePapyrusReaderUrl, resolveFixtureLaunch } from './fixtureSelection';

describe('fixture selection', () => {
  it('accepts the reader deep link and preserves run metadata', () => {
    const parsed = parsePapyrusReaderUrl('exp+papyrus-sdk://reader?fixture=large-100&runId=run-1&sampleId=sample-1&perf=1&viewerMode=compat');
    expect(parsed).toMatchObject({
      valid: true,
      fixture: 'large-100',
      runId: 'run-1',
      sampleId: 'sample-1',
      perfEnabled: true,
      viewerMode: 'compat',
    });
    expect(resolveFixtureLaunch(parsed)).toMatchObject({ fixture: 'large-100', fallback: false });
  });

  it('accepts an empty reader pathname', () => {
    expect(parsePapyrusReaderUrl('exp+papyrus-sdk://reader')).toMatchObject({ valid: true, fixture: 'small' });
  });

  it('reports invalid fixtures and falls back explicitly to small', () => {
    const parsed = parsePapyrusReaderUrl('exp+papyrus-sdk://reader?fixture=missing');
    expect(parsed).toMatchObject({ valid: true, fixture: 'missing', invalidFixture: 'missing' });
    expect(resolveFixtureLaunch(parsed)).toMatchObject({ fixture: 'small', fallback: true, invalidFixture: 'missing' });
  });

  it.each([
    'https://reader?fixture=small',
    'exp+papyrus-sdk://other?fixture=small',
    'exp+papyrus-sdk://reader/not-empty?fixture=small',
  ])('rejects unsupported URL %s', (url) => {
    expect(parsePapyrusReaderUrl(url)).toMatchObject({ valid: false });
  });

  it('uses the small fixture for a cold start without an incoming URL', () => {
    expect(parsePapyrusReaderUrl(null)).toMatchObject({ valid: true, fixture: 'small', reason: 'no-url' });
  });

  it('rejects a viewer mode other than compat', () => {
    expect(parsePapyrusReaderUrl('exp+papyrus-sdk://reader?viewerMode=native')).toMatchObject({
      valid: false,
      reason: 'unsupported-viewer-mode',
    });
  });
});
