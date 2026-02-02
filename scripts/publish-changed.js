#!/usr/bin/env node
const { spawnSync, execSync } = require('node:child_process');
const path = require('node:path');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const args = new Set(process.argv.slice(2));
const buildOnly = args.has('--build-only');
const dryRun = args.has('--dry-run');
const bumpIndex = process.argv.indexOf('--bump');
const bump = bumpIndex > -1 ? process.argv[bumpIndex + 1] : null;

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

const getBaseRef = () => {
  const envRef = process.env.BASE_REF;
  if (envRef) return envRef;
  try {
    execSync('git rev-parse --verify origin/main', { stdio: 'ignore' });
    return 'origin/main';
  } catch {
    return 'HEAD~1';
  }
};

const baseRef = getBaseRef();
let changedFiles = [];
try {
  const output = execSync(`git diff --name-only ${baseRef}...HEAD`, { encoding: 'utf8' });
  changedFiles = output.split(/\r?\n/).filter(Boolean);
} catch (error) {
  console.error('[publish-changed] Failed to read git diff. Set BASE_REF explicitly.');
  process.exit(1);
}

const changedPackages = packages.filter((pkg) =>
  changedFiles.some((file) => file.startsWith(`${pkg}/`))
);

if (changedPackages.length === 0) {
  console.log('[publish-changed] No package changes detected.');
  process.exit(0);
}

console.log(`[publish-changed] Base ref: ${baseRef}`);
console.log('[publish-changed] Packages to process:');
changedPackages.forEach((pkg) => console.log(`- ${pkg}`));

const run = (cmd, cmdArgs, cwd) => {
  if (dryRun) {
    console.log(`[publish-changed] (dry-run) ${cmd} ${cmdArgs.join(' ')} @ ${cwd}`);
    return;
  }
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

if (bump) {
  changedPackages.forEach((pkg) => {
    const cwd = path.resolve(process.cwd(), pkg);
    run(npmCmd, ['version', bump, '--no-git-tag-version', '--prefix', cwd], process.cwd());
  });
}

changedPackages.forEach((pkg) => {
  const cwd = path.resolve(process.cwd(), pkg);
  run(pnpmCmd, ['build'], cwd);
});

if (buildOnly) process.exit(0);

changedPackages.forEach((pkg) => {
  const cwd = path.resolve(process.cwd(), pkg);
  run(npmCmd, ['publish', '--access', 'public', '--no-git-checks'], cwd);
});
