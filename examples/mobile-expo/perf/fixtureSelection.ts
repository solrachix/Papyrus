export const MOBILE_FIXTURE_NAMES = ['small', 'large-100', 'large-1000', 'varied-sizes'] as const;
export type MobileFixtureName = (typeof MOBILE_FIXTURE_NAMES)[number];

export type ParsedReaderLaunch = {
  valid: boolean;
  fixture: string;
  invalidFixture?: string;
  runId?: string;
  sampleId?: string;
  perfEnabled: boolean;
  viewerMode: 'compat';
  reason?: string;
};

export type ResolvedFixtureLaunch = {
  fixture: MobileFixtureName;
  fallback: boolean;
  invalidFixture?: string;
  runId?: string;
  sampleId?: string;
  perfEnabled: boolean;
  viewerMode: 'compat';
};

const SCHEME = 'exp+papyrus-sdk:';

export function parsePapyrusReaderUrl(url: string | null): ParsedReaderLaunch {
  if (url === null) {
    return { valid: true, fixture: 'small', perfEnabled: false, viewerMode: 'compat', reason: 'no-url' };
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== SCHEME || parsed.hostname !== 'reader' || (parsed.pathname !== '' && parsed.pathname !== '/')) {
      return { valid: false, fixture: 'small', perfEnabled: false, viewerMode: 'compat', reason: 'unsupported-url' };
    }
    const viewerMode = parsed.searchParams.get('viewerMode') ?? 'compat';
    if (viewerMode !== 'compat') {
      return { valid: false, fixture: 'small', perfEnabled: false, viewerMode: 'compat', reason: 'unsupported-viewer-mode' };
    }
    const fixture = parsed.searchParams.get('fixture') ?? 'small';
    return {
      valid: true,
      fixture,
      invalidFixture: MOBILE_FIXTURE_NAMES.includes(fixture as MobileFixtureName) ? undefined : fixture,
      runId: parsed.searchParams.get('runId') ?? undefined,
      sampleId: parsed.searchParams.get('sampleId') ?? undefined,
      perfEnabled: parsed.searchParams.get('perf') === '1',
      viewerMode: 'compat',
    };
  } catch {
    return { valid: false, fixture: 'small', perfEnabled: false, viewerMode: 'compat', reason: 'malformed-url' };
  }
}

export function resolveFixtureLaunch(parsed: ParsedReaderLaunch): ResolvedFixtureLaunch {
  const isKnown = MOBILE_FIXTURE_NAMES.includes(parsed.fixture as MobileFixtureName);
  return {
    fixture: isKnown ? parsed.fixture as MobileFixtureName : 'small',
    fallback: !isKnown,
    invalidFixture: isKnown ? undefined : parsed.fixture,
    runId: parsed.runId,
    sampleId: parsed.sampleId,
    perfEnabled: parsed.perfEnabled,
    viewerMode: parsed.viewerMode,
  };
}
