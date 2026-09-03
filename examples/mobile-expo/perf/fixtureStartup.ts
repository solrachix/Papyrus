import { parsePapyrusReaderUrl, resolveFixtureLaunch, type MobileFixtureName } from './fixtureSelection';

type FixtureAsset = unknown;
type FixtureManifestEntry = { sha256: string; byteLength: number; pageCount: number };

type StartupArgs = {
  url: string | null;
  warm?: boolean;
  engine: { load(source: FixtureAsset): Promise<void>; getPageCount(): number };
  registry: Partial<Record<MobileFixtureName, FixtureAsset>>;
  manifest: Partial<Record<MobileFixtureName, FixtureManifestEntry>>;
  resolveAsset: (asset: FixtureAsset) => FixtureAsset;
  emit: (name: string, payload: Record<string, unknown>) => void;
};

export async function bootstrapFixtureLaunch({ url, warm = false, engine, registry, manifest, resolveAsset, emit }: StartupArgs) {
  const parsed = parsePapyrusReaderUrl(url);
  void warm;

  if (!parsed.valid) {
    emit('fixture.invalid', { reason: parsed.reason ?? 'unsupported-url', url, perfEnabled: parsed.perfEnabled });
    return { ignored: false, parsed, invalid: true };
  }

  const resolved = resolveFixtureLaunch(parsed);
  if (resolved.invalidFixture) {
    emit('fixture.invalid', { requestedFixture: resolved.invalidFixture, fallbackFixture: resolved.fixture, perfEnabled: resolved.perfEnabled });
  }
  const expected = manifest[resolved.fixture];
  const asset = registry[resolved.fixture];
  if (!expected || asset === undefined) {
    emit('fixture.invalid', { requestedFixture: resolved.fixture, reason: 'manifest-or-registry-missing', perfEnabled: resolved.perfEnabled });
    throw new Error(`fixture is not bundled: ${resolved.fixture}`);
  }

  emit('fixture.requested', {
    requestedFixture: parsed.fixture,
    resolvedFixture: resolved.fixture,
    runId: resolved.runId,
    sampleId: resolved.sampleId,
    perfEnabled: resolved.perfEnabled,
  });
  await engine.load(resolveAsset(asset));
  const pageCount = engine.getPageCount();
  if (pageCount !== expected.pageCount) throw new Error(`fixture page count mismatch: ${resolved.fixture}`);
  emit('fixture.loaded', {
    requestedFixture: parsed.fixture,
    resolvedFixture: resolved.fixture,
    runId: resolved.runId,
    sampleId: resolved.sampleId,
    perfEnabled: resolved.perfEnabled,
    sha256: expected.sha256,
    byteLength: expected.byteLength,
    pageCount,
  });
  return { ignored: false, parsed, resolved, pageCount };
}
