import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectAndroidApk } from './android-apk-fixtures-check.mjs';

test('APK inspector validates clean tree, fixture hashes and bundle names', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'papyrus-apk-check-'));
  const fixtureDir = path.join(root, 'assets', 'fixtures');
  await fs.mkdir(fixtureDir, { recursive: true });
  const fixtures = ['small', 'large-100', 'large-1000', 'varied-sizes'].map((name) => ({ name, file: `assets/fixtures/${name}.pdf`, byteLength: 3, pageCount: 1 }));
  for (const fixture of fixtures) {
    const bytes = Buffer.from(fixture.name);
    await fs.writeFile(path.join(fixtureDir, `${fixture.name}.pdf`), bytes);
    fixture.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    fixture.byteLength = bytes.length;
  }
  const manifestPath = path.join(fixtureDir, 'fixture-manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, totalBytes: 0, fixtures }));
  const apkPath = path.join(root, 'app-release.apk');
  await fs.writeFile(apkPath, 'apk');
  const result = await inspectAndroidApk({
    apkPath,
    manifestPath,
    commit: 'abc',
    cwd: root,
    run: (command) => command === 'git' ? '' : 'fixture-manifest small large-100 large-1000 varied-sizes index.android.bundle',
  });
  assert.equal(result.commit, 'abc');
  assert.equal(result.apkBytes, 3);
});
