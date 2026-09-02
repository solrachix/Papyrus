# Papyrus PR26 — Native PDF raster → surface draw profiling

> **For agentic workers:** REQUIRED: execute this plan incrementally, keeping the worktree scoped to PR26 and validating each change before moving to the next task.

**Goal:** Instrument the Android compat PDF render path so a `perf=1` run can separate queueing, Pdfium rasterization, UI handoff, bitmap installation, invalidation, and draw time without changing rendering behavior.

**Architecture:** The existing JS render lifecycle supplies the causal `renderRequestId`, document/sample context, surface, page, and generation to the native `PapyrusPageView`. Native instrumentation emits opt-in NDJSON-like log markers using `SystemClock.elapsedRealtimeNanos()`. A deterministic Node aggregator joins native markers with existing JS events and gfxinfo, classifies cache hit/miss, and reports phase distributions. `perf=0` keeps the existing call path and emits no markers.

**Tech Stack:** TypeScript, React Native, Android Java/Pdfium, JUnit, Node test runner, Bash/ADB, pnpm.

---

## Task 1: Establish the render contract and plan artifacts

**Files:**
- Create: `docs/superpowers/plans/2026-09-02-papyrus-pr26-native-raster-draw-profile.md`
- Read: `packages/ui-react-native/components/PageRenderer.tsx`
- Read: `packages/engine-native/index.ts`
- Read: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java`
- Read: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java`

- [x] Verify the dedicated branch is based on merged `main` and the worktree is clean.
- [x] Map compat `PageRenderer → MobileDocumentEngine → PapyrusNativeEngineModule → PapyrusPageView`.
- [x] Keep `PapyrusPdfViewerView.java` and other formats outside the change.

## Task 2: Add failing aggregation tests first

**Files:**
- Create: `scripts/benchmarks/android-native-render-aggregate.mjs`
- Create: `scripts/benchmarks/android-native-render-aggregate.test.mjs`

- [x] Add a deterministic fixture containing request/enqueue/worker/lock/raster/cache/UI/install/invalidate/draw events.
- [x] Assert phase durations use monotonic native nanosecond timestamps converted to milliseconds.
- [x] Assert cache hit and cache miss are classified separately.
- [x] Assert missing or duplicate phase markers make a sample incomplete rather than inventing a duration.
- [x] Run the focused Node test and observe the expected RED before implementation.

## Task 3: Implement opt-in native telemetry and context propagation

**Files:**
- Modify: `packages/types/index.ts`
- Modify: `packages/core/engine.ts`
- Modify: `packages/engine-native/index.ts`
- Modify: `packages/ui-react-native/perf/renderInvocation.ts`
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java`
- Create: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeRenderTelemetry.java`
- Create: `packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusNativeRenderTelemetryTest.java`

- [x] Add an optional render telemetry context to the engine API; non-native engines ignore it.
- [x] Forward `renderRequestId`, `surfaceId`, `pageIndex`, `generation`, fixture/run/sample/document context, and `perfEnabled` only for perf runs.
- [x] Emit request/enqueue/worker start, lock wait/acquired when applicable, raster start/end, cache hit/put/evict, UI post/start, install start/end, invalidate, and onDraw start/end.
- [x] Use `SystemClock.elapsedRealtimeNanos()` for all native timestamps.
- [x] Preserve existing render Promise and terminal semantics; no behavior changes when `perf=0`.
- [x] Add unit coverage for opt-in, required identity fields, and monotonic timestamp source.

## Task 4: Implement the pure aggregator

**Files:**
- Modify: `scripts/benchmarks/android-native-render-aggregate.mjs`
- Modify: `scripts/benchmarks/android-native-render-aggregate.test.mjs`

- [x] Parse native marker lines and existing JS events without mixing samples.
- [x] Derive queue wait, lock wait, raster, post-raster, UI queue, install, draw, request-to-ready, and cache metrics.
- [x] Join phase data to `renderRequestId` and retain page/surface/generation context.
- [x] Output JSON and concise Markdown-friendly summaries with valid/incomplete counts.
- [x] Run focused tests GREEN.

## Task 5: Extend the emulator runner and documentation

**Files:**
- Modify: `scripts/benchmarks/android-scroll-profile.sh`
- Modify: `scripts/benchmarks/README.md`
- Create: `docs/performance/pr-26-native-pdf-raster-draw-profile.md`

- [x] Add an opt-in native-render profiling mode to the existing runner, keeping `emulator-5554` explicit.
- [x] Capture logcat, gfxinfo, meminfo, metadata, and aggregated native render output per fixture/sample.
- [x] Preserve the PR25 four-swipe protocol and add cache-hit/miss classification.
- [x] Document that the native profiler is diagnostic only and does not prove causation by itself.

## Task 6: Verify package, Android, and emulator behavior

- [x] Run focused JS/Node tests and existing Android unit tests.
- [x] Build the UI packages and release APK.
- [x] Run one `perf=0` smoke and one `perf=1` smoke on `emulator-5554` with `large-1000`.
- [x] Confirm `perf=0` emits no native markers and `perf=1` correlates every native request with a JS render request.
- [x] Run the PR25-style 3× `perf=0` vs 3× `perf=1` control; report measurements without claiming a gain.
- [x] Run shell/node syntax checks and inspect the final diff for out-of-scope files.
- [x] Add `request → surface` and `surface → enqueue` measurements and validate
  cache-hit samples without an artificial enqueue phase.
- [x] Run `large-100` and `varied-sizes` with `perf=1` and record their native
  phase distributions.

## Task 7: Publish PR26

- [x] Commit only scoped PR26 changes.
- [x] Push `codex/pr26-native-raster-draw-profile`.
- [x] Update the existing PR against `main` with exact tests, APK/emulator
  evidence, profiler-overhead control, limitations, and next-step
  classification.
- [x] Do not merge automatically.
