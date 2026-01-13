#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const bump = process.argv[2] || 'patch';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const packages = [
  'packages/types',
  'packages/core',
  'packages/engine-epub',
  'packages/engine-text',
  'packages/engine-pdfjs',
  'packages/engine-native',
  'packages/ui-react',
  'packages/ui-react-native',
  'packages/expo-plugin',
];

for (const pkg of packages) {
  console.log(`Bumping ${pkg} (${bump})`);
  const result = spawnSync(npmCmd, ['version', bump, '--no-git-tag-version', '--prefix', pkg], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
