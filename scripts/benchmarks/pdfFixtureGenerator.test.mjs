import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generateMobileFixtures, verifyMobileFixtures } from './pdfFixtureGenerator.mjs';

test('mobile fixtures are deterministic and ship a static registry', async () => {
  const first = await fs.mkdtemp(path.join(os.tmpdir(), 'papyrus-fixtures-a-'));
  const second = await fs.mkdtemp(path.join(os.tmpdir(), 'papyrus-fixtures-b-'));
  const firstManifest = await generateMobileFixtures(first);
  const secondManifest = await generateMobileFixtures(second);

  assert.deepEqual(firstManifest, secondManifest);
  assert.deepEqual(await verifyMobileFixtures(first), firstManifest);
  assert.deepEqual(await verifyMobileFixtures(second), secondManifest);
  assert.deepEqual(firstManifest.fixtures.map((fixture) => fixture.pageCount), [1, 100, 1000, 4]);
  assert.ok(firstManifest.totalBytes <= 20 * 1024 * 1024);

  const registry = await fs.readFile(path.join(first, 'fixtureRegistry.generated.ts'), 'utf8');
  for (const name of ['small', 'large-100', 'large-1000', 'varied-sizes']) {
    assert.match(registry, new RegExp(`require\\(\\"\\./assets/fixtures/${name}\\.pdf\\"\\)`));
  }

  const varied = await fs.readFile(path.join(first, 'assets/fixtures/varied-sizes.pdf'));
  const mediaBoxes = [...varied.toString('latin1').matchAll(/\/MediaBox \[0 0 (\d+) (\d+)\]/g)].map((match) => match.slice(1).join('x'));
  assert.deepEqual(mediaBoxes.slice(0, 4), ['612x792', '792x612', '595x842', '842x595']);
  assert.equal(crypto.createHash('sha256').update(varied).digest('hex'), firstManifest.fixtures[3].sha256);
});
