#!/usr/bin/env node
const { spawnSync, execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

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

const getEsbuildPath = () => {
  if (process.env.ESBUILD_BINARY_PATH) return process.env.ESBUILD_BINARY_PATH;
  if (process.platform !== 'win32') return null;
  const candidate = path.resolve(process.cwd(), 'node_modules/esbuild/node_modules/@esbuild/win32-x64/esbuild.exe');
  return fs.existsSync(candidate) ? candidate : null;
};

const run = (cmd, cmdArgs, cwd) => {
  console.log(`[publish-changed] $ ${cmd} ${cmdArgs.join(' ')} (cwd: ${cwd})`);
  if (dryRun) {
    console.log(`[publish-changed] (dry-run) ${cmd} ${cmdArgs.join(' ')} @ ${cwd}`);
    return;
  }
  const env = { ...process.env };
  const esbuildPath = getEsbuildPath();
  if (esbuildPath && !env.ESBUILD_BINARY_PATH) {
    env.ESBUILD_BINARY_PATH = esbuildPath;
  }
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd, env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const bumpVersion = (version, kind) => {
  const parts = version.split('.');
  if (parts.length < 3) return null;
  const [major, minor, patchAndRest] = parts;
  const patch = patchAndRest.split('-')[0];
  const suffix = patchAndRest.includes('-') ? `-${patchAndRest.split('-').slice(1).join('-')}` : '';
  const nums = [Number(major), Number(minor), Number(patch)];
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (kind === 'major') {
    nums[0] += 1; nums[1] = 0; nums[2] = 0;
  } else if (kind === 'minor') {
    nums[1] += 1; nums[2] = 0;
  } else {
    nums[2] += 1;
  }
  return `${nums[0]}.${nums[1]}.${nums[2]}${suffix}`;
};

const bumpPackageJson = (cwd, kind) => {
  const pkgPath = path.join(cwd, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const data = JSON.parse(raw);
  if (!data.version) return;
  const next = bumpVersion(data.version, kind);
  if (!next) {
    console.error(`[publish-changed] Invalid version in ${pkgPath}: ${data.version}`);
    process.exit(1);
  }
  data.version = next;
  fs.writeFileSync(pkgPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`[publish-changed] bumped ${data.name} -> ${next}`);
};

if (bump) {
  changedPackages.forEach((pkg) => {
    const cwd = path.resolve(process.cwd(), pkg);
    bumpPackageJson(cwd, bump);
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
