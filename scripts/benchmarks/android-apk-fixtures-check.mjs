import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const defaultRun = (command, args, cwd) => execFileSync(command, args, { cwd, encoding: 'utf8' });
const defaultReadBinary = (command, args, cwd) => execFileSync(command, args, { cwd });

const sha256 = async (file) => {
  const hash = crypto.createHash('sha256');
  hash.update(await fsPromises.readFile(file));
  return hash.digest('hex');
};

export async function inspectAndroidApk({ apkPath, manifestPath, commit, cwd = process.cwd(), run = defaultRun, readBinary = defaultReadBinary, maxBytes = 30 * 1024 * 1024 }) {
  const status = run('git', ['status', '--porcelain'], cwd);
  if (String(status).trim()) throw new Error('worktree must be clean before APK inspection');
  const manifest = JSON.parse(await fsPromises.readFile(manifestPath, 'utf8'));
  const apkBytes = (await fsPromises.stat(apkPath)).size;
  if (apkBytes > maxBytes) throw new Error(`APK exceeds ${maxBytes} bytes`);
  const fixtureHashes = {};
  for (const fixture of manifest.fixtures) {
    const fixturePath = path.join(path.dirname(manifestPath), fixture.file.replace(/^assets\/fixtures\//, ''));
    const actual = await sha256(fixturePath);
    if (actual !== fixture.sha256) throw new Error(`fixture hash mismatch: ${fixture.name}`);
    fixtureHashes[fixture.name] = actual;
  }
  const listing = String(run('unzip', ['-l', apkPath], cwd));
  const pdfEntries = listing.split(/\r?\n/).map((line) => line.match(/\s+(\S+\.pdf)\s*$/i)?.[1]).filter(Boolean);
  if (pdfEntries.length > 0) {
    const packagedHashes = new Set(await Promise.all(pdfEntries.map(async (entry) => {
      const hash = crypto.createHash('sha256');
      hash.update(readBinary('unzip', ['-p', apkPath, entry], cwd));
      return hash.digest('hex');
    })));
    for (const fixture of manifest.fixtures) {
      if (!packagedHashes.has(fixture.sha256)) throw new Error(`fixture missing from APK contents: ${fixture.name}`);
    }
  } else {
    for (const name of manifest.fixtures.map((fixture) => fixture.name)) {
      if (!listing.includes(name)) throw new Error(`fixture missing from APK listing: ${name}`);
    }
  }
  if (!listing.includes('fixture-manifest') && !listing.includes('index.android.bundle')) throw new Error('fixture manifest is absent from APK bundle');
  if (listing.includes('http') && listing.includes('raw.githubusercontent.com')) throw new Error('remote fixture fallback found in APK listing');
  return { commit, apkSha256: await sha256(apkPath), manifestSha256: await sha256(manifestPath), apkBytes, fixtureHashes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((entries, value, index, values) => {
    if (!value.startsWith('--')) return entries;
    entries.push([value.slice(2), values[index + 1]]);
    return entries;
  }, []));
  console.log(JSON.stringify(await inspectAndroidApk({ apkPath: args.apk, manifestPath: args.manifest, commit: args.commit }), null, 2));
}
