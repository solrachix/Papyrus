# PR29 — Expo 52 / pnpm isolated Android release build reproducibility Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Expo 52/RN 0.76 Android example install and produce a release APK from a clean checkout while retaining the repository's isolated pnpm linker and without changing reader behavior.

**Architecture:** Reproduce the failure from a fresh worktree, identify the smallest versioned resolution/autolinking change that keeps Expo 52's dependency graph coherent, and add a focused regression check for the generated Android autolinking package. Keep the fix scoped to Expo 52 example/build infrastructure; do not add artificial application dependencies or alter PDF/EPUB runtime code.

**Tech Stack:** pnpm 9, Expo SDK 52, React Native 0.76, Metro 0.81, Gradle, Android release build, Node-based verification scripts.

---

## Chunk 1: Establish the clean failure and map the dependency boundary

**Files:**
- Inspect: `.npmrc`
- Inspect: `pnpm-workspace.yaml`
- Inspect: `examples/mobile-expo/package.json`
- Inspect: `examples/mobile-expo/metro.config.js`
- Inspect: `examples/mobile-expo/android/settings.gradle`
- Inspect: `pnpm-lock.yaml`

- [ ] **Step 1: Confirm the dedicated worktree is based on merged `main` and is clean.**

Run `git status --short --branch` and `git rev-parse HEAD`; expected branch `codex/pr29-expo52-pnpm-isolated`, base commit `84980749d8379d56f6fc1a3204db29ab284a553b`, with no tracked changes.

- [ ] **Step 2: Install from the frozen lockfile with the repository's isolated linker.**

Run `pnpm install --frozen-lockfile`; record whether installation itself succeeds and which importer owns Expo/Metro/autolinking packages.

- [ ] **Step 3: Run the release build before changing files.**

Run from `examples/mobile-expo/android`:
`bash ./gradlew :app:assembleRelease --rerun-tasks -PreactNativeArchitectures=x86_64 -Pexpo.gif.enabled=false -Pexpo.webp.enabled=false`.

Expected red result: the clean Expo 52/RN 0.76 build cannot resolve its autolinking/Expo package graph or generates an invalid `ExpoModulesPackage` import.

## Chunk 2: Implement the minimal reproducibility fix

**Files:**
- Modify: only the Expo 52/example package-manager or Android autolinking configuration proven necessary by Chunk 1.
- Test: `scripts/` or `examples/mobile-expo/` focused regression check, if a stable generated-file/config contract can be tested without committing generated build output.

- [ ] **Step 1: Add a regression test/check for the observed failure.**

The check must distinguish a correct Expo 52 autolinking resolution from the invalid `expo.core.ExpoModulesPackage` result and must not rely on a developer-created symlink or a pre-existing `node_modules` tree.

- [ ] **Step 2: Run the check and confirm it fails on the unmodified clean setup.**

Record the failing assertion or missing resolution as the red baseline.

- [ ] **Step 3: Apply the smallest versioned fix.**

Prefer correcting package-manager/Expo 52 resolution or the example's documented monorepo configuration. Do not add transitive packages as direct dependencies unless source inspection proves the example directly imports them; do not globally pin a Metro version used by the RN 0.81 example; do not change reader code.

- [ ] **Step 4: Run the focused regression check again.**

Expected green result: Expo 52 resolves the intended package graph and the generated autolinking source uses the correct Expo 52 package namespace.

## Chunk 3: Verify clean installation and Android release output

**Files:**
- Modify: `docs/performance/pr-29-expo52-pnpm-isolated-repro.md`

- [ ] **Step 1: Recreate dependencies from scratch in the dedicated worktree.**

Use a fresh install with `pnpm install --frozen-lockfile`; no local symlink, manual dependency install, or generated-file edit is allowed.

- [ ] **Step 2: Validate package builds and focused tests.**

Run the affected package builds, the focused regression test, and the existing mobile/native checks that are relevant to the Android example.

- [ ] **Step 3: Generate the release APK from the clean dependency tree.**

Run the release Gradle task and record the APK path, commit, install mode, and whether autolinking completed without manual edits.

- [ ] **Step 4: Install the fresh APK only on `emulator-5554` and perform a smoke launch.**

Confirm the package launches and reaches the example without a Metro/autolinking error. Do not use the physical POCO.

- [ ] **Step 5: Document the reproducible procedure and evidence.**

Record the supported Expo/RN/Metro versions, pnpm linker, exact commands, clean-build result, APK checksum, emulator package launch, and any remaining unrelated warning.

- [ ] **Step 6: Confirm the worktree is clean and commit the scoped change.**

Stage only the plan, fix, regression check, and PR29 report. Commit with a focused message such as `fix(mobile-expo): restore Expo 52 isolated build reproducibility`.

## Chunk 4: Publish PR29

- [ ] **Step 1: Push `codex/pr29-expo52-pnpm-isolated` and verify the remote head.**

- [ ] **Step 2: Open PR29 against `main` with the clean-build evidence.**

The PR body must state the original failure, the minimal fix, exact validation, and that no reader behavior was changed.

- [ ] **Step 3: Recheck the published diff and status before handing it off.**
