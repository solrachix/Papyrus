#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { getPublicPackageDirs } = require('./public-packages');

const bump = process.argv[2] || 'patch';
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const packages = getPublicPackageDirs();

for (const pkg of packages) {
  console.log(`Bumping ${pkg} (${bump})`);
  const result = spawnSync(npmCmd, ['version', bump, '--no-git-tag-version', '--prefix', pkg], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
