# Android Rotation Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents are available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validar e, somente se necessário, corrigir a recuperação de orientação do PDF compat/FlatList no Android, preservando a página atual e concluindo apenas com viewport e render da orientação mais recente válidos.

**Architecture:** A investigação começa na `main` com telemetria opt-in e sem alteração comportamental. Cada mudança de orientação recebe um `orientationChangeId`; dimensões, página lógica, surface, generation e render terminal são correlacionados. Se o sintoma não for reproduzido no compat, a PR documenta o resultado e não toca no viewer nativo. Se houver causa comprovada, a correção será mínima, baseada em estado real e com política latest-wins.

**Tech Stack:** TypeScript, React Native `FlatList`, Zustand, Vitest, Gradle/ADB e APK debug. O `examples/mobile-expo` usado na validação roda React Native 0.76; o exemplo `mobile` usa RN 0.81. Toda validação Android desta PR usa exclusivamente `emulator-5554`.

---

## Scope and safety

- Incluído: Android, `viewerMode="compat"`, PDF, portrait/landscape, viewport, layout, surface, render generation, loading e restauração da página.
- Fora: `PapyrusPdfViewerView`/viewer nativo, iOS, web, EPUB, TXT, CBR, pinch, distant jump, rotação do documento, scroll-jank geral e stress amplo de memória.
- Não usar POCO nem dispositivo físico.
- Todo ADB deve usar `adb -s emulator-5554 ...`.
- Não adicionar `setTimeout`, `sleep`, delay arbitrário ou retry cego como correção.
- Não desativar virtualização nem renderizar todas as páginas.

## File map

- Inspect/modify only if evidence requires: `packages/ui-react-native/components/Viewer.tsx` — orientation/layout, FlatList window, current page and scroll restoration.
- Inspect/modify only if evidence requires: `packages/ui-react-native/components/PageRenderer.tsx` — layout-valid predicate, render generation and ready/terminal correlation.
- Modify if telemetry needs shared event types: `packages/ui-react-native/perf/perfSession.ts`.
- Create if pure state extraction is justified: `packages/ui-react-native/components/orientationRecovery.ts`.
- Test: `packages/ui-react-native/components/orientationRecovery.test.ts` and focused tests adjacent to any changed module.
- Create/update report: `docs/performance/pr-23-android-rotation-recovery.md`.
- Update design/spec only when the observed cause or stop condition changes: `docs/superpowers/specs/2026-09-02-pdf-rotation-design.md`.

---

## Task 1: Prepare and freeze the baseline

**Files:** no production changes. Create `docs/performance/pr-23-android-rotation-recovery.md` only after collecting evidence.

- [x] **Step 1: Confirm checkout and device.**

  Run:

  ```bash
  pwd
  git status --short --branch
  git show -s --format='%H %D %s' origin/main
  git worktree list
  adb devices
  adb -s emulator-5554 shell getprop ro.build.version.release
  adb -s emulator-5554 shell wm size
  ```

  Expected: worktree `/tmp/papyrus-pr23-android-rotation-recovery`, branch `codex/pr23-android-rotation-recovery`, clean status, `origin/main` containing merge `1bde57e`, and only `emulator-5554` used.

- [x] **Step 2: Build/install the debug APK from this worktree.**

  Reuse the existing example build path and package configuration. Record the exact APK path, package id, commit SHA and Metro port. Do not change native code merely to make the build pass.

- [x] **Step 3: Open the compat PDF and verify a stable initial surface.**

  Use a small/normal PDF first, then `large-100`, `large-1000` and `varied-sizes`. Confirm `document.ready`/`render.ready`, visible content and no loading spinner before rotating.

- [x] **Step 4: Record the baseline protocol.**

  For pages `1`, `2`, `50`, `90`, `500`, `900` and the last page when available, run portrait → landscape → portrait. Save screenshot and filtered logcat per case. Mark each result as deterministic/intermittent and identify the direction that fails.

---

## Task 2: Reproduce before changing behavior

**Files:** no production changes.

- [x] **Step 1: Lock and change device orientation explicitly.**

  Use only `adb -s emulator-5554 shell settings put system accelerometer_rotation 0` and `adb -s emulator-5554 shell settings put system user_rotation 0|1`, or the equivalent existing harness helper. Record the orientation command and resulting display dimensions; do not infer orientation from timing.

- [ ] **Step 2: Execute the required matrix.**

  Run these cases in `viewerMode=compat`:

  ```text
  page 1:   portrait → landscape
  page 50:  portrait → landscape
  page 50:  landscape → portrait
  page 900: portrait → landscape
  page 900: landscape → portrait
  rapid:    portrait → landscape → portrait
  rapid:    portrait → landscape → portrait → landscape
  ```

  Repeat critical failures at least three times before calling them deterministic. Do not count a case if the app was still loading or the device did not actually rotate.

- [ ] **Step 3: Test the document-size and page-shape dimensions.**

  Repeat the relevant cases with `large-100`, `large-1000` and `varied-sizes`, including a naturally portrait page, a naturally landscape page, a very tall page and a very wide page. Keep PDF page orientation separate from device orientation.

- [x] **Step 4: Apply the stop condition.**

  If compat remains correct and the failure exists only in the native viewer, stop production investigation, document that the symptom is outside PR23 scope, and do not modify `PapyrusPdfViewerView`.

---

## Task 3: Add failing tests for rotation lifecycle state

Not applicable: the reproduction identified a native Pdfium bitmap-size/cache
failure before a React Native orientation state machine was implicated.

**Files:** create `packages/ui-react-native/components/orientationRecovery.ts` and `packages/ui-react-native/components/orientationRecovery.test.ts` only if the baseline identifies a state-machine or predicate that can be isolated.

- [ ] **Step 1: Define the pure contract.**

  The extracted logic must represent:

  ```text
  orientationChangeId
  latest orientation wins
  valid viewport requires width > 0 and height > 0
  stale generation cannot complete the current cycle
  page target is preserved independently from visual offset
  current cycle completes only with current render.ready
  ```

- [ ] **Step 2: Write tests before implementation.**

  Cover:

  ```text
  layout 0xN/Nx0 is invalid
  current generation + current target can complete
  old render.ready cannot complete a newer orientation
  rapid orientation changes leave only the latest cycle active
  page N remains the logical target
  stale target requires replacement, not completion
  ```

- [ ] **Step 3: Run the focused test and confirm it fails for the new contract.**

  Run:

  ```bash
  pnpm exec vitest run packages/ui-react-native/components/orientationRecovery.test.ts
  ```

  Expected: failure before the implementation exists or before the old behavior is adapted.

---

## Task 4: Instrument the existing runtime without changing semantics

Not applicable: the native logs and controlled screenshots were sufficient to
correlate the failing render boundary; no additional JS telemetry was needed.

**Files:** modify `Viewer.tsx`, `PageRenderer.tsx` or `perfSession.ts` only where the baseline shows a missing causal boundary.

- [ ] **Step 1: Add an opt-in orientation cycle.**

  Emit one `orientation.change.detected` per physical orientation change with monotonic timestamp, previous/current orientation, current page and viewport dimensions when known.

- [ ] **Step 2: Trace layout and target state.**

  Emit `orientation.viewport.changed`, `orientation.layout.invalidated`, `orientation.surface.invalidated` and `orientation.position.restored` with `orientationChangeId`, `pageIndex`, `currentPage`, `targetPage`, `surfaceId`, `viewTag`, `layoutWidth`, `layoutHeight`, `zoom` and `renderScale` where available.

- [ ] **Step 3: Correlate every render terminal.**

  Reuse the existing render lifecycle IDs and emit `orientation.render.request`, `orientation.render.terminal` and `orientation.render.ready`. Include `renderRequestId`, `generation`, `status` and the target orientation. A stale/abandoned render must not be reported as ready for a newer cycle.

- [ ] **Step 4: Trace loading ownership.**

  Record who turns loading on and off for each orientation cycle. A cycle is incomplete if loading ends from an old generation or if a current target becomes stale without a replacement request.

- [ ] **Step 5: Keep telemetry disabled by default.**

  Run existing package tests to prove `perf=off` preserves the old execution path and that `viewerMode="native"` receives no compat-only orientation behavior.

---

## Task 5: Classify the measured cause

**Files:** create/update `scripts/benchmarks/android-rotation-aggregate.mjs` and its test only if raw logs need deterministic classification.

- [x] **Step 1: Correlate one orientation cycle.**

  Build the sequence:

  ```text
  change.detected
  → valid viewport/layout
  → target page/surface
  → current-generation render.request
  → render terminal
  → current-generation render.ready
  → position.restored
  → loading complete
  ```

- [x] **Step 2: Classify only observed failures.**

  Use one of: invalid/transient layout, old render satisfying new state, stale render without replacement, logical page loss, stale offset restoration, old-sized surface/bitmap, target unmount without replacement, or loading terminal missing. Do not implement a fix from a category without a matching event sequence.

- [ ] **Step 3: Measure latest-wins behavior.**

  For rapid rotations, prove that intermediate cycles may end stale/abandoned but the final orientation has one valid replacement render and no infinite loading.

- [x] **Step 4: Record the baseline report.**

  Include device/API, commit, APK, fixture, page, orientation sequence, screenshots, event sequence, failure type, current page, target page, generation and limitations. Do not publish invented timing or memory values.

---

## Task 6: Implement the smallest evidence-backed fix

**Files:** only the production files implicated by Task 5; update the pure tests first.

- [ ] **Step 1: Adapt the failing pure test to the proven contract.**

- [x] **Step 2: Implement one narrow fix.**

  Examples allowed only when logs prove them: reject invalid dimensions before rendering; preserve logical page and recalculate position from new layout; invalidate old generation and request a deterministic replacement; retain loading until the current target is ready; or guard against surface remount losing its render request.

- [x] **Step 3: Do not add unrelated behavior.**

  No native viewer edits, pinch changes, page-jump changes, global virtualization changes or arbitrary delays.

- [x] **Step 4: Run focused tests and the package build.**

  Expected: all focused tests pass and the changed package builds cleanly.

---

## Task 7: Validate the fix on the emulator

**Files:** update `docs/performance/pr-23-android-rotation-recovery.md`.

- [x] **Step 1: Rebuild/install the APK from the exact branch head.**

  Final debug APK built and installed on `emulator-5554`.

- [ ] **Step 2: Repeat the identical before/after cases.**

  Minimum: page 1, page 50 both directions, page 900 both directions, `large-100`, `large-1000`, `varied-sizes`, and the rapid four-transition sequence.

- [ ] **Step 3: Run the post-rotation smoke.**

  After each stable rotation: scroll one page and back, perform one distant jump smoke, and perform one pinch smoke. These are regression checks only; do not expand this PR into pinch or distant-jump work.

- [ ] **Step 4: Run 20 orientation changes.**

  Alternate portrait ↔ landscape on `large-1000`. Capture crashes, ANR, loading state, current page, render terminals, stale/cancelled/abandoned counts, attached views and PSS when available.

- [ ] **Step 5: Verify visual criteria.**

  Confirm page N remains visible, no page-1 reset, no prolonged white surface/flicker, no old bitmap stretched to the new viewport, chrome remains usable and no nudge/scroll is needed to recover.

---

## Task 8: Final verification and delivery

- [x] Run focused tests, the full `packages/ui-react-native` suite, and `pnpm --filter @papyrus-sdk/ui-react-native build`.
- [x] Run `git diff --check`.
- [x] If `engine-native` was changed, run its Android tests/build; otherwise leave it untouched.
- [ ] Update the PR description with exact baseline/after evidence, root cause, files, event sequence, tests, APK and emulator result.
- [ ] Confirm branch is based on `origin/main`, worktree is clean, and diff is limited to Android compat orientation scope.
- [ ] Commit in focused steps, push `codex/pr23-android-rotation-recovery`, open the PR and do not merge automatically.

### Merge gate

Recommend merge only when the symptom is reproduced or incorrect behavior is clearly demonstrated, the cause is causally identified, the fix is minimal, all required fixtures/directions pass, rapid rotation and 20-change stress pass, and tests/build/APK validation succeed exclusively on `emulator-5554`. If the historical bug is not reproduced, recommend no speculative fix and document that result instead.
