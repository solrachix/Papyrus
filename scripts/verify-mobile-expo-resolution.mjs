import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = process.cwd();
const exampleRoot = path.join(repoRoot, 'examples/mobile-expo');
const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));
const requireFromExample = createRequire(
  path.join(exampleRoot, 'package.json'),
);

const npmrc = fs.readFileSync(path.join(repoRoot, '.npmrc'), 'utf8');
assert.match(npmrc, /^node-linker=isolated$/m);
assert.match(npmrc, /^public-hoist-pattern\[\]=expo-\*$/m);
assert.match(npmrc, /^public-hoist-pattern\[\]=babel-preset-expo$/m);
assert.match(npmrc, /^public-hoist-pattern\[\]=@babel\/runtime$/m);

for (const moduleName of [
  'expo-asset/package.json',
  'babel-preset-expo/package.json',
  '@babel/runtime/package.json',
]) {
  assert.doesNotThrow(() => requireFromExample.resolve(moduleName));
}

const reactNativePath = requireFromExample.resolve('react-native/package.json');
assert.match(reactNativePath, /react-native@0\.76\.0_/);

const metroConfig = requireFromRepo('./examples/mobile-expo/metro.config.js');
const virtualStorePath = path.join(repoRoot, 'node_modules/.pnpm/node_modules');
assert.equal(metroConfig.resolver.disableHierarchicalLookup, true);
assert.ok(metroConfig.resolver.nodeModulesPaths.includes(virtualStorePath));
for (const extension of ['pdf', 'epub', 'html']) {
  assert.ok(metroConfig.resolver.assetExts.includes(extension));
}

const autolinkingPath = path.join(
  exampleRoot,
  'android/build/generated/autolinking/autolinking.json',
);
if (!process.argv.includes('--skip-generated')) {
  assert.ok(fs.existsSync(autolinkingPath), `Missing ${autolinkingPath}`);
  const autolinking = JSON.parse(fs.readFileSync(autolinkingPath, 'utf8'));
  assert.equal(
    autolinking.dependencies.expo.platforms.android.packageImportPath,
    'import expo.modules.ExpoModulesPackage;',
  );
}

console.log(
  `Expo 52 isolated resolution OK (RN package: ${reactNativePath})`,
);
