---
title: "Release / Publish"
description: "How to bump versions, build, and publish packages to npm."
---
# Release / Publish

This repo publishes packages to npm (scoped under `@papyrus-sdk/*`).

## 1) Bump versions

We use the built-in script to bump every package in `packages/*`:

```bash
pnpm bump:packages minor
```

Valid bumps: `patch`, `minor`, `major`.

## 2) Build packages

Build **packages only** (skip examples) to avoid Vite/esbuild issues:

```bash
pnpm -r --filter ./packages/** build
```

If you want to build everything, use:

```bash
pnpm -r --workspace-concurrency=1 build
```

Note: `examples/web` can fail on Windows with `Error: spawn EPERM` (esbuild). If that happens, stick to the packages-only build.

## 3) Commit changes

Publishing requires a clean git tree unless you pass `--no-git-checks`.

```bash
git add .
git commit -m "release: bump packages to vX.Y.Z"
```

## 4) Publish to npm

```bash
pnpm -r --filter ./packages/** publish --access public
```

If you intentionally publish from a dirty working tree:

```bash
pnpm -r --filter ./packages/** publish --access public --no-git-checks
```

## Publish only changed packages

Detects changes since `origin/main` (or `BASE_REF`) and publishes only those packages.

```bash
pnpm publish:changed
```

Build only:

```bash
pnpm build:changed
```

Override the base ref:

```bash
BASE_REF=main pnpm publish:changed
```

### Tags

Add a tag if needed:

```bash
pnpm -r --filter ./packages/** publish --access public --tag next
```
