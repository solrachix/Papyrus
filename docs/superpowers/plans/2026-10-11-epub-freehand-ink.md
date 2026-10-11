# EPUB Freehand Ink Implementation Plan

> **For agentic workers:** REQUIRED: Use `superpowers:executing-plans` if available. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent, reflow-aware freehand EPUB ink to Papyrus, keeping the existing PDF path and the consuming app untouched.

**Architecture:** Collect and preview raw pointer coordinates in the EPUB content document, then simplify the stroke and resolve its retained samples through a spatial index of text fragments. Persist bounded `epub-ink` CFI segments plus legacy `rect`/`path` fallback data, render smoothed continuous segments from their current CFI positions, and send one validated annotation over the existing bridge.

**Tech Stack:** TypeScript, plain JavaScript UMD runtime embedded in the EPUB WebView, Zustand store, React Native WebView bridge, Vitest, Node `performance.now()` benchmark.

---

## File map

- `packages/types/index.ts`: public `Annotation.epubInk` sidecar, point, and segment contracts; keep `Annotation.anchor` on the existing `epub-cfi` variant for backend compatibility.
- `packages/core/annotationAnchors.ts`: structural validation for bounded CFI samples and offsets in the `epubInk` sidecar.
- `packages/core/annotationAnchors.test.ts`: valid/invalid anchor boundaries and JSON round-trip.
- `packages/core/store.ts`: undo/redo annotation reconciliation events so event-based persistence sees restored EPUB annotations too.
- `packages/core/store.epub-ink.test.ts`: common store undo/redo and event behavior for EPUB ink.
- `packages/ui-react-native/runtime/epubAnnotations.js`: spatial grid, deferred CFI anchoring, simplification, gesture preview/cancellation, segmented SVG rendering, and session cleanup.
- `packages/ui-react-native/runtime/epubAnnotations.test.ts`: reflow, distance cutoff, discontinuity smoothing, gesture lifecycle, and persisted snapshot rendering.
- `packages/ui-react-native/runtime/epubInk.bench.mjs`: repeatable synthetic benchmark for a long chapter index and strokes with hundreds of raw/simplified points.
- `packages/ui-react-native/components/epubAnnotationEvents.ts`: parser/validator for one committed `EPUB_INK_CREATED` event.
- `packages/ui-react-native/components/epubAnnotationEvents.test.ts`: stale session, malformed payload, caps, and valid serialized ink event.
- `packages/ui-react-native/components/WebViewViewer.tsx`: activate EPUB pen mode from `activeTool` + `activeDrawToolPreset`, pass style settings, accept the single committed annotation, and keep ordinary selection flow intact.
- `packages/ui-react-native/components/BottomBar.actions.test.ts`: prove the EPUB annotate control opens/dismisses ToolDock and does not enter the native PencilKit route.
- `packages/ui-react-native/runtime/runtime.js` and `runtime/index.html`: generated outputs from `syncComicRuntime.mjs`; update through the package build script, not hand-maintained source edits.
- `packages/ui-react-native/package.json`: add a local benchmark command only if needed; do not change package versions or publish.

The consuming app and API remain read-only. The app snapshots all annotation fields and JSON-clones them in the outbox. The API requires a recognized `epub-cfi` anchor with a quote, but stores and returns each full annotation JSON object; keep that anchor pointed at the first ink sample and add `epubInk: {version:1, kind:"epub-ink", segments:[...]}` as an ignored extension. The legacy ink card reads `rect`/`path`; retain those fields as a static preview fallback.

## Chunk 1: Anchor contract and store history

### Task 1: Add bounded EPUB ink anchor types and validation

**Files:**
- Modify: `packages/types/index.ts`
- Modify: `packages/core/annotationAnchors.ts`
- Modify: `packages/core/annotationAnchors.test.ts`

- [x] Write tests first for valid/invalid sidecar payloads, bounded point lists, finite offsets, and JSON round-trip with the recognized first-point `epub-cfi` anchor plus legacy `rect`/`path` fields.
- [x] Run `rtk pnpm exec vitest run packages/core/annotationAnchors.test.ts` and confirm the new cases fail because the validator is not implemented yet.
- [x] Add `EpubInkPoint`, `EpubInkSegment`, `EpubInkData`, and optional `Annotation.epubInk`; keep the existing `AnnotationAnchor` union unchanged and point its required `epub-cfi` value at the first ink point.
- [x] Add `validateEpubInkData`; enforce an aggregate maximum of 512 points, recognized CFI anchors, bounded hrefs, finite local offsets, and an explicit sidecar version/kind without changing existing anchor validation.
- [x] Add an old-consumer fixture that ignores `epubInk` but still reads the standard ink fields, then rerun the focused test and confirm it passes.

### Task 2: Make undo/redo observable to persistence consumers

**Files:**
- Modify: `packages/core/store.ts`
- Create: `packages/core/store.epub-ink.test.ts`

- [x] Write failing tests that add an EPUB ink annotation, undo it, and redo it while asserting the annotation snapshot and `ANNOTATION_CREATED`/`ANNOTATION_DELETED` events.
- [x] Add one focused annotation-list reconciliation helper that emits delete for removed IDs, create for restored IDs, and update for changed IDs when undo/redo replaces a snapshot.
- [x] Keep the existing PDF page-ink commit reconciliation untouched.
- [x] Run `rtk pnpm exec vitest run packages/core/store.epub-ink.test.ts packages/core/store.ink.test.ts`.

## Chunk 2: Runtime anchoring and drawing

### Task 3: Build the spatial index and stroke geometry helpers

**Files:**
- Modify: `packages/ui-react-native/runtime/epubAnnotations.js`
- Modify: `packages/ui-react-native/runtime/epubAnnotations.test.ts`

- [x] Write failing tests for a grid index built from many text fragments, nearby/too-distant queries, and a 500-point raw path simplified while preserving endpoints and corners.
- [x] Build an index once per content layout from text-only `Range.getClientRects()` fragments; exclude script/style/annotation overlay content.
- [x] Use a uniform spatial grid so a retained point examines nearby cells, not every text fragment. Measure candidate counts, not only wall time.
- [x] Keep the initial anchor cutoff `clamp(12, 0.8 × lineHeight, 28)` CSS px; split the path at any sample with no nearby text anchor.
- [x] Resolve CFI only after simplification, once per retained point; assert no CFI work occurs in the pointer-move path.
- [x] Bound exceptionally long raw gestures and run runtime helper tests for endpoint retention and the final sample cap.

### Task 4: Capture, cancel, persist, and render EPUB ink

**Files:**
- Modify: `packages/ui-react-native/runtime/epubAnnotations.js`
- Modify: `packages/ui-react-native/runtime/epubAnnotations.test.ts`
- Modify: `packages/ui-react-native/runtime/runtime.js` (generated)
- Modify: `packages/ui-react-native/runtime/index.html` (generated)

- [x] Write tests for mode off/on, pointer cancel, second-pointer cancellation, content teardown, stale document session, section switch, valid one-message commit, and re-render from JSON-restored annotations.
- [x] Add a lightweight canvas preview that paints only the latest segment per pointer move; collect coordinates but do not query CFI or the spatial grid during movement.
- [x] On pointer up, simplify raw samples, query the spatial grid, resolve retained samples to glyph CFI anchors, split disconnected points, enforce size limits, and emit one annotation event.
- [x] Persist `Annotation.epubInk` with `kind:"epub-ink"` per continuous segment, keep `Annotation.anchor.kind:"epub-cfi"` pointing to the first point, and include legacy normalized `rect`/`path` values for old consumers. Keep the sidecar CFI data authoritative in the current Papyrus runtime.
- [x] Render each CFI segment as a smoothed path in a pointer-transparent SVG overlay. During relayout, break newly distant points into separate rendered subpaths rather than connecting across a large gap.
- [x] Rebuild the spatial index on content render, resize/layout/reflow, and font readiness. Tear down observers, listeners, capture state, preview, and index when the iframe unloads or session changes.
- [x] Regenerate `runtime.js` and `index.html` using the existing `rtk pnpm --filter @papyrus-sdk/ui-react-native build` script after source behavior passes.

## Chunk 3: React bridge, compatibility, and evidence

### Task 5: Integrate the EPUB-only ToolDock mode and bridge

**Files:**
- Modify: `packages/ui-react-native/components/epubAnnotationEvents.ts`
- Modify: `packages/ui-react-native/components/epubAnnotationEvents.test.ts`
- Modify: `packages/ui-react-native/components/WebViewViewer.tsx`
- Modify: `packages/ui-react-native/components/BottomBar.actions.test.ts`

- [x] Write parser tests for current-session ink commit, stale-session rejection, over-cap payload rejection, and full JSON-preserved anchor.
- [x] Pass `activeTool`, `activeDrawToolPreset`, color, opacity, and width into a session-scoped runtime mode command. Enable drawing only for EPUB with the actual `ink` preset; highlight/underline continue to use text selection.
- [x] Accept one validated commit, call the common `addAnnotation` store path, and allow normal annotation snapshot sync to restore it after close/reopen.
- [x] Verify with an action test that EPUB opens/dismisses ToolDock and never activates the PDFKit/PencilKit session. Do not modify `thoth-stack`.
- [x] Run parser, bottom bar, store, and runtime tests together.

### Task 6: Measure, build the local package, and review the complete diff

**Files:**
- Create: `packages/ui-react-native/runtime/epubInk.bench.mjs`
- Modify: `packages/ui-react-native/package.json` only if a stable benchmark command is useful.
- Review: all changed files in this Papyrus branch.

- [x] Benchmark a synthetic long chapter with at least 5,000 text fragments and 500/1,000-point raw paths. Report index build time, median query time, max candidate fragments per lookup, estimated post-pointer-up CFI count, and resulting stored points; label the fixture synthetic.
- [x] Run extreme reflow tests with substantially changed glyph rectangles/line positions and assert disconnected paths are split rather than joined across large gaps.
- [x] Run `rtk pnpm exec vitest run packages/core/annotationAnchors.test.ts packages/core/store.epub-ink.test.ts packages/core/store.ink.test.ts packages/ui-react-native/runtime/epubAnnotations.test.ts packages/ui-react-native/components/epubAnnotationEvents.test.ts packages/ui-react-native/components/BottomBar.actions.test.ts`.
- [x] Run `rtk pnpm --filter @papyrus-sdk/ui-react-native build` for the local SDK output and TypeScript bundling. This is not a mobile distribution build.
- [x] Inspect `rtk git diff --check`, complete diff, generated runtime output, example serialized annotation, and branch/worktree status. Report iOS physical smoke as pending.
- [x] Do not bump package versions, run npm publish, edit `thoth-stack`, or start Xcode/EAS/Store distribution builds.

## Validation record

- Focused suite: 6 files, 35 tests passed.
- Local SDK build: `@papyrus-sdk/ui-react-native` build and DTS generation passed. Core and types package builds also passed earlier in this worktree.
- Synthetic benchmark: 5,000 fragments; index 4.732 ms. For 500 raw points: 483 simplified/accepted anchors, median grid lookup 0.769 ms (1.59 µs/point), max 6 candidates per lookup. For 1,000 raw points: 512 retained/accepted anchors, median grid lookup 0.645 ms (1.26 µs/point), max 6 candidates. This fixture does not run DOM layout or a real CFI parser; its post-pointer-up CFI count is an estimate equal to accepted points.
- Broader Vitest run attempted earlier: 111 files passed and 12 failed due existing unrelated contract/dependency/suite-discovery issues; 579 tests passed and 1 failed. Those failures were in unchanged native code expectations, missing test packages, or helper `.test.mjs` files without Vitest suites.
- Pending: physical finger/Apple Pencil smoke in WKWebView on iPhone/iPad. No distribution build or npm publication was started.
