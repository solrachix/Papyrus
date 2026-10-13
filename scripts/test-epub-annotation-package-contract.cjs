const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');

const root = path.resolve(__dirname, '..');
const readManifest = packagePath =>
  JSON.parse(fs.readFileSync(path.join(root, packagePath, 'package.json'), 'utf8'));

const core = readManifest('packages/core');
const native = readManifest('packages/engine-native');
const ui = readManifest('packages/ui-react-native');

assert.equal(core.version, '0.2.25', 'Core must ship the quote-preservation fix as a new patch');
assert.equal(native.version, '0.2.24', 'The native engine must be republished with the matching Core peer');
assert.equal(ui.version, '0.2.40', 'The React Native UI must be republished with matching peers');
assert.equal(native.peerDependencies['@papyrus-sdk/core'], core.version);
assert.equal(native.devDependencies['@papyrus-sdk/core'], core.version);
assert.equal(ui.peerDependencies['@papyrus-sdk/core'], core.version);
assert.equal(ui.peerDependencies['@papyrus-sdk/engine-native'], native.version);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'papyrus-epub-package-contract-'));
const tarballs = path.join(temporaryRoot, 'tarballs');
const consumer = path.join(temporaryRoot, 'consumer');
fs.mkdirSync(tarballs);
fs.mkdirSync(consumer);

const run = (command, args, cwd = root, env = process.env) =>
  execFileSync(command, args, {cwd, env, stdio: 'inherit'});

const pack = packagePath => {
  run('pnpm', ['pack', '--pack-destination', tarballs], path.join(root, packagePath));
  const packageName = path.basename(packagePath);
  const packageVersion = readManifest(packagePath).version;
  const tarball = path.join(tarballs, `papyrus-sdk-${packageName}-${packageVersion}.tgz`);
  assert.ok(fs.existsSync(tarball), `Expected packed artifact ${tarball}`);
  return tarball;
};

const readTarEntry = (tarball, targetPath) => {
  const archive = gunzipSync(fs.readFileSync(tarball));
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    const dataStart = offset + 512;
    if (entryPath === targetPath) return archive.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Tarball ${path.basename(tarball)} does not contain ${targetPath}`);
};

const extractPackage = (tarball, destination) => {
  const archive = gunzipSync(fs.readFileSync(tarball));
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const entryPath = prefix ? `${prefix}/${name}` : name;
    const size = Number.parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim(), 8);
    const dataStart = offset + 512;
    const relativePath = entryPath.startsWith('package/') ? entryPath.slice('package/'.length) : null;
    if (relativePath && (relativePath === 'package.json' || relativePath.startsWith('dist/'))) {
      const outputPath = path.join(destination, relativePath);
      fs.mkdirSync(path.dirname(outputPath), {recursive: true});
      fs.writeFileSync(outputPath, archive.subarray(dataStart, dataStart + size));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return JSON.parse(fs.readFileSync(path.join(destination, 'package.json'), 'utf8'));
};

try {
  for (const packageName of [
    '@papyrus-sdk/types',
    '@papyrus-sdk/core',
    '@papyrus-sdk/engine-native',
    '@papyrus-sdk/ui-react-native',
  ]) {
    run('pnpm', ['--filter', packageName, 'run', 'build']);
  }

  const packedTypes = pack('packages/types');
  const packedCore = pack('packages/core');
  const packedNative = pack('packages/engine-native');
  const packedUi = pack('packages/ui-react-native');

  const typesPackage = extractPackage(packedTypes, path.join(consumer, 'node_modules/@papyrus-sdk/types'));
  const corePackage = extractPackage(packedCore, path.join(consumer, 'node_modules/@papyrus-sdk/core'));
  const nativePackage = JSON.parse(readTarEntry(packedNative, 'package/package.json').toString('utf8'));
  const uiPackage = JSON.parse(readTarEntry(packedUi, 'package/package.json').toString('utf8'));
  const nativeComicView = readTarEntry(packedNative, 'package/ios/PapyrusComicDocumentView.m').toString('utf8');
  const nativeComicGeometry = readTarEntry(packedNative, 'package/ios/PapyrusComicZoomGeometry.h').toString('utf8');

  assert.equal(corePackage.version, core.version, 'Packed Core version must match its manifest');
  assert.equal(typesPackage.version, core.dependencies['@papyrus-sdk/types']);
  assert.equal(nativePackage.peerDependencies['@papyrus-sdk/core'], corePackage.version);
  assert.equal(uiPackage.peerDependencies['@papyrus-sdk/core'], corePackage.version);
  assert.equal(uiPackage.peerDependencies['@papyrus-sdk/engine-native'], nativePackage.version);
  assert.equal(uiPackage.peerDependencies['@papyrus-sdk/types'], typesPackage.version);
  assert.ok(nativeComicView.includes('PapyrusComicContinuousLayout'), 'Packed native engine must include the continuous comic zoom layout');
  assert.ok(nativeComicGeometry.includes('PapyrusComicContinuousDocumentHeight'), 'Packed native engine must include the tested zoom geometry helpers');

  const uiSource = readTarEntry(packedUi, 'package/dist/index.js').toString('utf8');
  assert.ok(/require\(["']@papyrus-sdk\/core["']\)/.test(uiSource), 'Packed UI must import Core at runtime');
  assert.ok(uiSource.includes('getAnnotationEditPatch'), 'Packed AnnotationEditor must call the Core edit patch helper');
  assert.ok(uiSource.includes('getAnnotationQuote'), 'Packed AnnotationEditor must call the Core quote helper');

  const consumerScript = `
    const assert = require('node:assert/strict');
    const core = require('@papyrus-sdk/core');
    const original = {
      id: 'readium-note', type: 'comment', pageIndex: 4,
      rect: {x: 0, y: 0, width: 0, height: 0}, color: '#fbbf24',
      content: 'selected EPUB text', noteContent: 'first note', createdAt: 1,
      readiumLocator: {href: 'OPS/chapter.xhtml', type: 'application/xhtml+xml', text: {highlight: 'selected EPUB text'}},
    };
    const patch = core.getAnnotationEditPatch(original, 'edited note', 'none', '#60a5fa');
    assert.equal(core.getAnnotationQuote(original), 'selected EPUB text');
    assert.equal(Object.hasOwn(patch, 'content'), false);
    const reopened = JSON.parse(JSON.stringify({...original, ...patch}));
    assert.equal(core.getAnnotationQuote(reopened), 'selected EPUB text');
    assert.equal(core.getAnnotationNote(reopened), 'edited note');
  `;
  run(process.execPath, ['-e', consumerScript], consumer, {
    ...process.env,
    NODE_PATH: path.join(root, 'packages/core/node_modules'),
  });

  console.log('Packed Core/UI contract passed; no registry packages were published.');
} finally {
  fs.rmSync(temporaryRoot, {recursive: true, force: true});
}
