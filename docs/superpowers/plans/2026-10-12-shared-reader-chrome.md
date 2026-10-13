# Shared EPUB Reader Chrome Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Papyrus and Readium use the same mature Papyrus presentation for iOS EPUB controls, settings, and table of contents while keeping engine state and behavior behind adapters.

**Architecture:** Extract controlled presentation views in `@papyrus-sdk/ui-react-native`, then keep existing SDK components as Papyrus-backed wrappers. The mobile app keeps its engine-neutral adapter and replaces its duplicated EPUB chrome with the shared SDK views; capabilities determine which actions appear. Changes are JavaScript/TypeScript only, so final distribution uses a compatible iOS OTA, or Xcode Cloud only if runtime compatibility prevents OTA.

**Tech Stack:** TypeScript, React Native, Papyrus SDK/pnpm, Vitest, Jest, Expo Updates, Xcode Cloud.

---

## File map

Papyrus SDK:

- Create `packages/ui-react-native/components/sharedReaderChrome/` controlled views and prop types for header, bottom controls/progress, settings, and contents.
- Modify `packages/ui-react-native/components/Topbar.tsx`, `BottomBar.tsx`, `SettingsSheet.tsx`, and the outline portion of `RightSheet.tsx` to use the controlled views while retaining Papyrus state mapping.
- Modify `packages/ui-react-native/index.ts` to export the new public API.
- Add focused tests beside the shared views and wrappers; preserve and run relevant existing layout/action tests.
- Modify `packages/ui-react-native/package.json` and `pnpm-lock.yaml` only for the release version and lock consistency.

Papel Amassado app:

- Modify `apps/mobile-rn/src/components/reading/UnifiedEpubReaderChrome.tsx` to compose the SDK views, retaining the app-level adapter and modal-dismiss orchestration.
- Modify `apps/mobile-rn/__mocks__/papyrus-ui-react-native.js` to expose renderable mocks for the new SDK views; the current mock exports only `CoverPreview` and `PageRenderer`.
- Update the thoth-stack root `pnpm-workspace.yaml` Papyrus UI override and version-keyed patched dependency. Keep the EPUB destination-navigation runtime patch keyed to the new version unless that behavior moves into the published SDK artifact.
- Modify `apps/mobile-rn/src/screens/tabs/reading.tsx` only where adapter props or legacy controls need to connect to the shared views.
- Modify `apps/mobile-rn/src/components/reading/ReaderEngineAdapter.ts` only if the controlled API needs an app-side type adjustment; keep engine-specific data app-owned.
- Add focused tests under `apps/mobile-rn/src/components/reading/` for adapter mapping, capabilities, empty TOC, progress, search, and modal transitions.
- Modify `apps/mobile-rn/package.json` and the thoth-stack repository root `pnpm-lock.yaml` for the published Papyrus UI SDK version.

## Chunk 1: Shared Papyrus UI presentation

### Task 1: Specify shared component contracts with failing tests

**Files:**
- Create tests under `packages/ui-react-native/components/sharedReaderChrome/`.
- The tests import the planned controlled view exports before those exports exist.

- [ ] Write focused tests for controlled header, bottom actions/progress, settings options, contents hierarchy, empty TOC, and callbacks.
- [ ] From the Papyrus repository root, run `pnpm exec vitest run packages/ui-react-native/components/sharedReaderChrome` and confirm expected failures are caused by missing exports/components.
- [ ] Keep the red tests as the contract; implement types and views only in Task 2.

### Task 2: Extract the controlled presentation views

**Files:**
- Create `packages/ui-react-native/components/sharedReaderChrome/ReaderHeaderView.tsx`.
- Create `packages/ui-react-native/components/sharedReaderChrome/ReaderBottomControlsView.tsx`.
- Create `packages/ui-react-native/components/sharedReaderChrome/ReaderSettingsView.tsx`.
- Create `packages/ui-react-native/components/sharedReaderChrome/ReaderContentsView.tsx`.
- Modify `packages/ui-react-native/index.ts`.

- [ ] Add tests for disabled/unavailable actions, selected theme, font bounds, optional Search, nested TOC indentation, and empty-state close behavior.
- [ ] From the Papyrus repository root, run `pnpm exec vitest run packages/ui-react-native/components/sharedReaderChrome` and confirm each new assertion fails before implementation.
- [ ] Implement controlled views using Papyrus spacing, iconography, colors, safe-area and accessibility patterns; do not import Papyrus stores or engines.
- [ ] Export only the stable controlled view components and public prop types.
- [ ] Run `pnpm exec vitest run packages/ui-react-native/components/sharedReaderChrome`, `pnpm --filter @papyrus-sdk/ui-react-native build`, and `pnpm exec eslint packages/ui-react-native/components/sharedReaderChrome --ext .ts,.tsx` from the Papyrus repository root.

### Task 3: Keep existing Papyrus components as compatibility wrappers

**Files:**
- Modify `packages/ui-react-native/components/Topbar.tsx`.
- Modify `packages/ui-react-native/components/BottomBar.tsx`.
- Modify `packages/ui-react-native/components/SettingsSheet.tsx`.
- Modify `packages/ui-react-native/components/RightSheet.tsx`.
- Create focused wrapper mapping tests `Topbar.sharedChrome.test.tsx`, `BottomBar.sharedChrome.test.tsx`, `SettingsSheet.sharedChrome.test.tsx`, and `RightSheet.sharedChrome.test.tsx` under `packages/ui-react-native/components/`.

- [ ] Add tests proving current Papyrus props/actions still map into the controlled views, including high contrast, Search, TOC href/anchor navigation, and EPUB progress scrubbing.
- [ ] Run `pnpm exec vitest run packages/ui-react-native/components/Topbar.sharedChrome.test.tsx packages/ui-react-native/components/BottomBar.sharedChrome.test.tsx packages/ui-react-native/components/SettingsSheet.sharedChrome.test.tsx packages/ui-react-native/components/RightSheet.sharedChrome.test.tsx` from the Papyrus repository root; confirm the new assertions fail before changing wrappers.
- [ ] Refactor wrapper rendering to use the shared presentation views; keep store reads, engine calls, tool-dock behavior, and existing exports in the wrapper layer.
- [ ] Run the focused SDK tests, `pnpm test:phase1`, `pnpm --filter @papyrus-sdk/ui-react-native build`, and `pnpm exec eslint packages/ui-react-native/components/Topbar.tsx packages/ui-react-native/components/BottomBar.tsx packages/ui-react-native/components/SettingsSheet.tsx packages/ui-react-native/components/RightSheet.tsx --ext .ts,.tsx` from the Papyrus repository root.

## Chunk 2: Mobile app migration

### Task 4: Map app adapters into shared view props

**Files:**
- Modify `apps/mobile-rn/src/components/reading/UnifiedEpubReaderChrome.tsx`.
- Modify/add focused tests under `apps/mobile-rn/src/components/reading/`.

- [ ] Add tests for Papyrus/Readium snapshots mapping to shared view props, capability gating, readiness, theme/font callbacks, progress callbacks, Search, TOC selection, and modal dismiss-then-action behavior on both modal platform paths.
- [ ] From `apps/mobile-rn`, run `pnpm exec jest src/components/reading/UnifiedEpubReaderChrome.test.tsx --runInBand` and confirm failures correspond to missing shared-view integration.
- [ ] Add lightweight shared-view mocks in `apps/mobile-rn/__mocks__/papyrus-ui-react-native.js` so Jest never renders undefined SDK exports.
- [ ] Replace copied visual layout with the SDK controlled views; retain `ReaderEngineAdapter` as the state/action bridge and let the app-level orchestrator defer Search and Contents until settings dismissal.
- [ ] Hide Contents when TOC is empty; if entries disappear while open, show the localized empty state and preserve close behavior.
- [ ] Show Search only for Papyrus when its capability and callback exist. Keep annotations, freehand ink, and ToolDock restricted to Papyrus.
- [ ] Keep Readium progress display-only except for its optional open-progress callback; keep Papyrus scrubbing behavior in the existing wrapper.
- [ ] From `apps/mobile-rn`, run `pnpm exec jest src/components/reading/UnifiedEpubReaderChrome.test.tsx --runInBand`, `pnpm typecheck`, and `pnpm exec eslint src/components/reading/UnifiedEpubReaderChrome.tsx src/screens/tabs/reading.tsx src/components/reading/ReaderEngineAdapter.ts`.

### Task 5: Validate the locally packed SDK in the app

**Files:**
- Create a packed SDK tarball under `/tmp/papyrus-shared-reader-chrome`.
- Temporarily install/link that tarball only in the clean mobile feature worktree.
- Modify the thoth-stack workspace patch key and Jest SDK mock.

- [ ] Build the SDK package, run `pnpm pack --pack-destination /tmp/papyrus-shared-reader-chrome` from `packages/ui-react-native`, and inspect the tarball's exports and runtime files.
- [ ] Determine the candidate patch version from `npm view @papyrus-sdk/ui-react-native version` and repository metadata; today the registry reports `0.2.37`, so recheck before selecting the next version.
- [ ] Re-key the `pnpm-workspace.yaml` override and patch to the candidate version, preserving `epub-go-to-destination`; if the SDK tarball contains that behavior, remove the duplicate thoth patch instead.
- [ ] Run `pnpm exec vitest run packages/ui-react-native/components/sharedReaderChrome packages/ui-react-native/components/Topbar.sharedChrome.test.tsx packages/ui-react-native/components/BottomBar.sharedChrome.test.tsx packages/ui-react-native/components/SettingsSheet.sharedChrome.test.tsx packages/ui-react-native/components/RightSheet.sharedChrome.test.tsx` from the Papyrus root against the candidate implementation.
- [ ] Install/link the local tarball only in the clean mobile feature worktree. Add renderable SDK mocks in `apps/mobile-rn/__mocks__/papyrus-ui-react-native.js`; keep temporary local paths out of committed manifests/lockfiles.
- [ ] From `apps/mobile-rn`, run `pnpm exec jest src/components/reading/UnifiedEpubReaderChrome.test.tsx --runInBand`, `pnpm typecheck`, and `pnpm exec eslint src/components/reading/UnifiedEpubReaderChrome.tsx src/screens/tabs/reading.tsx src/components/reading/ReaderEngineAdapter.ts` against that packed artifact.

## Chunk 3: Release and verification

### Task 6: Integrate and publish the SDK, then pin the app

**Files:**
- Papyrus SDK branch changes and `packages/ui-react-native` release metadata.
- `thoth-stack` app branch changes, `pnpm-workspace.yaml`, version-keyed runtime patch, Jest mock, and root `pnpm-lock.yaml`.

- [ ] Review both diffs for unrelated changes; retain the existing dirty files in the Papyrus main checkout untouched.
- [ ] Commit and push only the named files on the dedicated Papyrus worktree and the existing clean mobile feature branch.
- [ ] Open/update the SDK PR, verify checks, and integrate it before publishing the SDK package.
- [ ] Recheck registry metadata; from a clean worktree at merged Papyrus `main`, change directory to `packages/ui-react-native`, verify `pnpm publish --dry-run --access public --tag latest` includes only `@papyrus-sdk/ui-react-native`, then publish it with `pnpm publish --access public --tag latest` from that same package directory. Do not run publish from the monorepo root or use `pnpm publish:changed`, which may publish unrelated packages.
- [ ] Update `apps/mobile-rn/package.json`, the thoth-stack root `pnpm-workspace.yaml`, the version-keyed patch, and the root `pnpm-lock.yaml` to the exact published version; run `pnpm install --frozen-lockfile` from the thoth-stack root.
- [ ] Rerun the focused mobile Jest tests and `pnpm typecheck` against the registry-resolved package.
- [ ] Open/update the thoth-stack PR, verify its checks, and integrate the app changes before distribution.
- [ ] Confirm no native iOS source, Podfile, Xcode project, or native dependency changed.

### Task 7: Choose the distribution route and validate the TestFlight candidate

**Files:**
- No additional source changes unless release validation finds a blocker.

- [ ] Inspect the installed TestFlight build's actual runtime, EAS channel/branch, and embedded native dependencies using `apps/mobile-rn/docs/ota-updates.md`; compare them with the integrated app commit's runtime and config.
- [ ] If the runtime matches and the change remains JS/TS/assets only, publish an iOS-only experimental OTA to that exact compatible test channel and verify update identifiers. This candidate is the requested first real-device smoke target.
- [ ] Smoke-test the candidate on TestFlight for header/safe-area layout, progress and navigation, settings/modal transitions, empty/non-empty contents, Papyrus Search/ToolDock/ink, and Readium navigation/font/theme. Hold wider release until the user confirms these results.
- [ ] If runtime/channel verification proves OTA cannot safely reach the installed build, or an actionable Expo Updates limitation blocks publishing after resolution attempts, use the existing Xcode Cloud TestFlight workflow on the integrated `thoth-stack` commit. Run it manually against the integrated branch with `PAPYRUS_BUILD_FLAVOR=readium-testflight` and `EXPO_PUBLIC_ENABLE_READIUM_EXPERIMENTAL=1`; leave `PODS_LOCK_ONLY` unset so it produces an archive. Record the exact commit and workflow configuration before starting it. Do not infer incompatibility from missing evidence; inspect the installed build/runtime first.
- [ ] Report whether the OTA/build completed, and distinguish that from download, TestFlight availability, and execution on the user's device.

## Plan review gates

- The design spec at `docs/superpowers/specs/2026-10-12-shared-reader-chrome-design.md` is approved.
- Before publishing the package, verify its tarball contains the new controlled exports and excludes workspace-only dependencies.
- Before publishing the experimental OTA candidate, follow `apps/mobile-rn/docs/ota-updates.md` and confirm the exact runtime/channel target. This is a TestFlight validation candidate, not a broad production rollout.
- Do not run GitHub Actions for this change; use local checks, then OTA or Xcode Cloud according to runtime compatibility.
