# PDF Pinch Render-Ready Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instrument and measure the Android PDF pinch path from final zoom commit to render-ready, identifying duplicate renders, oversized bitmaps, stale work, and unnecessary page work before changing behavior.

**Architecture:** Reuse the existing perf session and Android pinch profile harness. Add causal render events at the existing engine/renderer boundaries, correlate them with a gesture/session ID and render request ID, and aggregate per-gesture timings without changing pinch math or scheduling semantics. Run the baseline from `origin/main`; only a later, evidence-backed fix may change behavior.

**Tech Stack:** TypeScript, React Native, Android/Kotlin/Java native engine, Vitest, shell benchmark harness, ADB emulator `emulator-5554`.

---

### Task 1: Audit baseline and harness

**Files:**
- Inspect: `scripts/benchmarks/android-pinch-profile.sh`
- Inspect: `scripts/benchmarks/android-pinch-aggregate.mjs`
- Inspect: `packages/ui-react-native/perf/*`
- Inspect: `packages/engine-native/index.ts`
- Inspect: `packages/ui-react-native/components/PageRenderer.tsx`

- [ ] Confirm the branch is based on `origin/main`, the worktree is clean, and the four fixtures plus both directions are supported.
- [ ] Trace existing `pinch.commit`, render lifecycle, generation, cancellation, and bitmap budget events.
- [ ] Run the existing focused tests before edits and record the baseline test count.

### Task 2: Add causal render instrumentation tests first

**Files:**
- Test: `packages/ui-react-native/perf/renderLifecycle.test.ts`
- Test: `packages/ui-react-native/perf/renderInvocation.test.ts`
- Test: `packages/engine-native/nativeModuleResolution.test.ts` if native event contracts require coverage

- [ ] Add failing tests for one render request producing one start and one terminal event with its request ID.
- [ ] Add failing tests for timestamps covering request, schedule/start, native render, surface swap, and ready.
- [ ] Add failing tests proving instrumentation is observational and does not add a second render invocation.
- [ ] Run the focused tests and verify the new tests fail for the missing event contract.

### Task 3: Instrument the post-commit path

**Files:**
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`
- Modify: `packages/ui-react-native/perf/renderLifecycle.ts`
- Modify: `packages/ui-react-native/perf/renderInvocation.ts`
- Modify: `packages/engine-native/index.ts` only if native request boundaries are not already exposed

- [ ] Emit or extend causal events for zoom set, render request/schedule/start, native page render start/end, bitmap preparation, surface swap, and render ready.
- [ ] Attach `gestureId`, `renderRequestId`, page index, generation, zoom, DPR, logical dimensions, target bitmap dimensions, and pixel count where available.
- [ ] Preserve existing cancellation/stale/error semantics and keep callbacks out of render effect dependencies where they are notifications only.
- [ ] Run the focused tests and the package build.

### Task 4: Extend aggregation without changing runtime behavior

**Files:**
- Modify: `scripts/benchmarks/android-pinch-aggregate.mjs`
- Modify: `scripts/benchmarks/android-pinch-profile.sh` only for missing metadata/event capture
- Test: `scripts/benchmarks/android-pinch-aggregate.test.mjs`
- Test: `scripts/benchmarks/android-pinch-profile.test.mjs`

- [ ] Add per-session `commitToReadyMs`, render durations, render count, duplicate count, stale/cancelled count, and bitmap pixel summaries.
- [ ] Reject incomplete sessions instead of silently falling back when causal timestamps are missing.
- [ ] Keep FPS/jank measurement independent from commit-to-ready timing.
- [ ] Add tests for one-render, duplicate-render, stale-render, and missing-terminal cases.

### Task 5: Run the baseline on the emulator

**Files:**
- Create: `docs/performance/pr-21-pdf-pinch-render-ready.md`
- Create: `docs/performance/results/pr-21-main-baseline.json` if the repository convention supports checked-in raw summaries

- [ ] Build/install the debug APK only on `emulator-5554`.
- [ ] Run at least five valid samples for each fixture/direction using the existing profile harness.
- [ ] Confirm `small`, `large-100`, `large-1000`, and `varied-sizes` all produce causal sessions.
- [ ] Record P50/P90 commit-to-ready, render counts, pixel counts, stale/cancel counts, and jank without claiming an optimization.
- [ ] Perform a visual smoke test for pinch-in/out, scroll after pinch, page boundary, and large-1000.

### Task 6: Decide whether a causal optimization is justified

- [ ] Identify the dominant stage from the baseline data.
- [ ] If no single cause is demonstrated, stop with instrumentation-only PR21 and document the next experiment.
- [ ] If a cause is demonstrated, propose a narrowly scoped follow-up change and add its failing behavioral test before implementation.
- [ ] Do not modify Reanimated, pinch focal math, or gesture handling in this plan.

### Task 7: Final verification and delivery

- [ ] Run the complete relevant Vitest suite, package builds, and `git diff --check`.
- [ ] Re-run the same emulator matrix after any causal fix and compare before/after distributions.
- [ ] Confirm no unrelated files changed, commit scoped changes, push the branch, and open/update the PR with exact evidence and limitations.
