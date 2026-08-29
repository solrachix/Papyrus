# Papyrus Zoom and Rendering Performance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o pinch/zoom mobile e web usar preview visual barato, um único commit final e renders protegidos contra trabalho obsoleto, com limites medidos para documentos grandes.

**Architecture:** Manter `zoom` do Zustand/engine como estado confirmado do documento. O gesto terá um contrato puro de sessão, com preview visual separado, focal point e guarda idempotente de finalização. RN React, Android nativo e web adaptarão esse contrato às suas superfícies existentes; nenhum caminho receberá Reanimated como requisito nesta rodada. Render/cache, canvas budget e overscan só serão alterados após testes ou medições reproduzirem o custo.

**Tech Stack:** TypeScript, React, React Native, `react-native-gesture-handler`, Android Java `ScaleGestureDetector`, PDF.js/DocumentEngine, Vitest, Jest e scripts Node de benchmark.

**Spec:** `docs/superpowers/specs/2026-08-29-papyrus-zoom-performance-design.md`

---

## Context and invariants

- Trabalhar no worktree `/home/carlos/projects/thoth/Papyrus-zoom-performance`, branch `codex/papyrus-zoom-performance-2026-08-29`.
- Não alterar `main` nem o worktree `/home/carlos/projects/thoth/Papyrus`.
- Preservar `selection`, annotations, single/double/continuous, PDF/EPUB/TXT e o viewer nativo padrão.
- Durante `onUpdate`/`touchmove`/`onScale`, os contadores de `setDocumentState`, `engine.setZoom` e `renderPage` devem permanecer em zero.
- Gesto confirmado faz um commit; cancelamento/falha faz zero commits e restaura o preview.
- Não usar `setState`/`setPinchPreviewScale` por frame se isso rerenderizar `Viewer` ou a árvore de páginas.

## File map

- `packages/ui-react-native/components/Viewer.tsx`: adaptar o gesto RN React, captura de âncora, preview e commit final.
- `packages/ui-react-native/components/PageRenderer.tsx`: manter a última superfície e expor somente a transformação necessária; não renderizar por update.
- `packages/ui-react-native/gesture/pinchZoom.ts`: concentrar sessão, focal point, offsets, clamp e finalização pura.
- `packages/ui-react-native/gesture/pinchZoom.test.mjs`: regressões do contrato exportado.
- `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`: auditar/adaptar o caminho nativo, preview no Canvas/View e `renderGeneration`.
- `packages/engine-native/android/src/test/` ou teste existente equivalente: contrato nativo de escala, geração e bitmap anterior.
- `packages/ui-react/components/Viewer.tsx`: adaptar touch pinch web para preview e commit único.
- `packages/ui-react/components/PageRenderer.tsx`: aplicar transform/origin sem render por touchmove e promover canvas final atomicamente.
- `packages/ui-react/components/contextualUi.test.ts` e testes novos próximos: preservar seleção/contextual UI.
- `packages/core/store.ts`: somente se uma medição demonstrar atualização/reação desnecessária; não mudar contrato público.
- `scripts/benchmarks/zoom-performance.mjs`: fixture/medição sintética de 100 e 1000 páginas, separado de prova visual.

## Chunk 1: Contract-first pinch session and RN React path

### Task 1: Add failing pure contract tests

**Files:**
- Modify: `packages/ui-react-native/gesture/pinchZoom.test.mjs`
- Modify: `packages/ui-react-native/gesture/pinchZoom.ts`

- [ ] **Step 1: Add a test for a confirmed gesture session** asserting that updates return preview data only, while finalization returns one committed zoom and anchored offsets.
- [ ] **Step 2: Add a test for cancellation/idempotence** asserting cancel returns the initial preview, `onFinalize` after `onEnd` is a no-op, and two finalization calls cannot produce two commits.
- [ ] **Step 3: Add focal-point tests** for zoom in/out, bounds, vertical scroll, horizontal overflow, and single/double page geometry with a 2 dp/px helper tolerance.
- [ ] **Step 4: Run `pnpm --filter @papyrus-sdk/ui-react-native build && node --test packages/ui-react-native/gesture/pinchZoom.test.mjs` and verify the new assertions fail for the missing contract.

### Task 2: Implement the minimal pure gesture contract

**Files:**
- Modify: `packages/ui-react-native/gesture/pinchZoom.ts`
- Modify: `packages/ui-react-native/gesture/pinchZoom.test.mjs`

- [ ] **Step 1: Implement session input/output types** containing initial/preview/committed zoom, focal point, initial offsets, anchor page and finalization state.
- [ ] **Step 2: Implement pure preview calculations** that never call store, engine or rendering code.
- [ ] **Step 3: Implement one-shot commit/cancel resolution** with a shared idempotence guard and explicit valid/cancelled outcomes.
- [ ] **Step 4: Run the focused gesture tests and verify all pass.**
- [ ] **Step 5: Commit `test/gesture contract` with `git add packages/ui-react-native/gesture/pinchZoom.* && git commit -m "test(reader): define pinch commit contract"`.

### Task 3: Integrate RN React without React updates per frame

**Files:**
- Modify: `packages/ui-react-native/components/Viewer.tsx`
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`
- Test: `packages/ui-react-native/components/Viewer.pinch.test.ts` (create if no suitable harness exists)

- [ ] **Step 1: Add a failing integration test** with spies proving repeated update events call neither `setDocumentState`, `engine.setZoom` nor `renderPage`, and do not increment a page-tree render counter.
- [ ] **Step 2: Add a failing test** proving a valid end calls the commit path exactly once and a cancel/finalize sequence calls it zero or one time according to the contract.
- [ ] **Step 3: Replace update-time store/engine calls** in `Viewer.tsx` with the pure preview session and a non-React visual transform mechanism already present in the project.
- [ ] **Step 4: If the existing RN infrastructure cannot apply the transform without React/JS frame updates, stop this task and record the measured boundary; do not add timers or DOM/native hacks.**
- [ ] **Step 5: Commit the RN path with `git add packages/ui-react-native/components/Viewer.tsx packages/ui-react-native/components/PageRenderer.tsx packages/ui-react-native/components/Viewer.pinch.test.ts && git commit -m "fix(reader): defer mobile pinch commit"`.

## Chunk 2: Android native viewer path

### Task 4: Test native scale preview and render generation

**Files:**
- Modify: existing native Android test files under `packages/engine-native/android/src/test/` or add the nearest project-compatible test.
- Inspect: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`

- [ ] **Step 1: Locate the Android test harness and existing `renderGeneration`/`lastPageBitmap` coverage.**
- [ ] **Step 2: Add a failing contract test or deterministic helper test** proving scale updates do not enqueue JS/store events or final renders.
- [ ] **Step 3: Add a failing generation test** proving an older render cannot promote a bitmap after a newer generation starts and the previous bitmap remains drawable while the new one is pending.
- [ ] **Step 4: Run the narrow Android test command supported by the module and record if an Android SDK/emulator is unavailable.**

### Task 5: Integrate native preview and one-shot final render

**Files:**
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java` only if event boundaries require it.

- [ ] **Step 1: Keep scale/translation preview in the native view/Canvas during `onScale`; do not emit per-frame zoom events to JS.**
- [ ] **Step 2: Capture focal point and scroll at scale begin and calculate final anchored offsets at scale end.**
- [ ] **Step 3: Make scale end idempotent and call final zoom/render exactly once; restore preview only after the active generation is ready.**
- [ ] **Step 4: Bound bitmap dimensions/pixels using measured fixture results; preserve deterministic fallback for allocation failure.**
- [ ] **Step 5: Run native tests and the relevant `@papyrus-sdk/engine-native` build.**
- [ ] **Step 6: Commit with `git add packages/engine-native/android && git commit -m "fix(android/pdf): defer pinch rendering to gesture end"`.

## Chunk 3: Web pinch and surface promotion

### Task 6: Add failing web preview/anchor tests

**Files:**
- Modify: `packages/ui-react/components/Viewer` tests or create `packages/ui-react/components/Viewer.pinch.test.tsx`.
- Modify: `packages/ui-react/components/PageRenderer.tsx` tests if needed.

- [ ] **Step 1: Test repeated two-touch updates** and assert zero store/engine/render calls before end.
- [ ] **Step 2: Test focal point/transform-origin and scroll compensation** for zoom in/out and touchcancel.
- [ ] **Step 3: Test a valid end commits once and a cancel restores the original surface without a commit.**
- [ ] **Step 4: Run the focused web tests and verify the new tests fail before implementation.**

### Task 7: Implement web preview and one-shot commit

**Files:**
- Modify: `packages/ui-react/components/Viewer.tsx`
- Modify: `packages/ui-react/components/PageRenderer.tsx`

- [ ] **Step 1: Replace RAF-time store/engine commits with a preview transform that updates only the rendered surface and its transform origin.**
- [ ] **Step 2: Preserve focal point through explicit document/viewport coordinate conversion and scroll compensation.**
- [ ] **Step 3: Commit zoom once on touchend/touchcancel policy defined by the pure contract; avoid duplicate touchend/finalize commits.**
- [ ] **Step 4: Keep the old canvas/text layer visible until the final render is ready and atomically promote the new surface.**
- [ ] **Step 5: Run focused tests and `pnpm --filter @papyrus-sdk/ui-react build`.**
- [ ] **Step 6: Commit with `git add packages/ui-react/components/Viewer.tsx packages/ui-react/components/PageRenderer.tsx packages/ui-react/components/*pinch* && git commit -m "fix(web): defer pinch render until gesture end"`.

## Chunk 4: Measured render, layout and long-document hardening

### Task 8: Add render-generation and surface-retention tests

**Files:**
- Create or modify focused tests beside `packages/ui-react/components/PageRenderer.tsx` and `packages/ui-react-native/components/PageRenderer.tsx`.
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java` only if native coverage identifies a gap.

- [ ] **Step 1: Add a failing test** for two overlapping async renders where only the newest generation may write/promote the surface.
- [ ] **Step 2: Add a failing test** that the previous canvas/bitmap remains visible while the newest render is pending.
- [ ] **Step 3: Implement the smallest generation/token owner at the surface-writing boundary.**
- [ ] **Step 4: Run all focused renderer tests and confirm no stale result can overwrite the current surface.**

### Task 9: Measure and bound canvas/overscan before changing policy

**Files:**
- Create: `scripts/benchmarks/zoom-performance.mjs`
- Modify: relevant viewport/render helpers only after a failing measurement or regression test identifies the limit.
- Test: focused helper tests beside the changed helper.

- [ ] **Step 1: Create synthetic 100-page and 1000-page profiles and measure layout time, render calls, canvas dimensions/pixels, overscan pages, and peak process memory where the runtime exposes it.**
- [ ] **Step 2: Record baseline results separately for parsing/text and visual rendering; label fixtures as synthetic.**
- [ ] **Step 3: Add failing helper tests for the smallest reproduced canvas/pixel and overscan constraints.**
- [ ] **Step 4: Implement only the measured bounds and predictable fallback; do not introduce tile rendering.**
- [ ] **Step 5: Re-run the benchmark and result-equivalence checks for page count, current page, dimensions, pagination and fallbacks.**
- [ ] **Step 6: Commit with `git add scripts/benchmarks packages/ui-react packages/ui-react-native packages/core && git commit -m "perf(reader): bound zoom rendering work"`.

### Task 10: Add instrumentation and final validation

**Files:**
- Modify: existing performance logging helpers and the three viewer paths.
- Modify: relevant test files and benchmark README/output format.

- [ ] **Step 1: Add counters/events for `pinch.start`, `pinch.update`, `pinch.commit`, `pinch.cancel`, `engine.setZoom`, `renderPage`, layout and stale-discard events.**
- [ ] **Step 2: Add assertions for the zero-during-update/one-at-end contract in RN React, Android native and web.**
- [ ] **Step 3: Run `pnpm test:phase1`, focused native/web/RN tests, and `pnpm build`.**
- [ ] **Step 4: Run the available Android/emulator smoke flow and record unavailable device/runtime rather than treating static tests as device proof.**
- [ ] **Step 5: Compare baseline and after results for visible output, page/current-page behavior, render counts, focal-point error, frame budget and memory; report unverified surfaces explicitly.**
- [ ] **Step 6: Commit instrumentation/docs separately if it remains independently reviewable.**

## Final review checklist

- [ ] `git diff main...HEAD` contains only this performance round and its spec/plan.
- [ ] No toolbar, search, safe-area, visual redesign, public API or default viewer changes slipped in.
- [ ] The RN React, Android native and web paths all implement the same commit/cancel semantics.
- [ ] No update-time `setDocumentState`, `engine.setZoom` or `renderPage` calls remain.
- [ ] No React/page-tree render occurs per preview frame.
- [ ] Focal point tolerances and canvas/overscan limits are backed by tests or explicitly reported as unverified.
- [ ] Parsing/text measurements are not presented as rendering proof.
