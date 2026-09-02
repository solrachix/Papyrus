# Papyrus PR27 — Android UI Thread Scroll Contention Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identificar, com instrumentação opt-in e traces correlacionados, o trabalho que atrasa `PapyrusPageView.post()` durante scroll de PDF no Android compat.

**Architecture:** Reutilizar os eventos PR25/PR26 e acrescentar apenas fronteiras de scheduling: UIBlock enqueue/start/resolved, seções `android.os.Trace` no UIBlock, callback de render, surface mount/layout e draw. Um agregador puro correlacionará `ui.post → ui.start` com eventos de scroll, mounts e, quando disponível, slices do trace; nenhum tuning de FlatList ou render será feito sem evidência.

**Tech Stack:** TypeScript, Java/Android, React Native UIManager, `android.os.Trace`, Node test runner, Bash/ADB, Perfetto/atrace, JUnit.

---

## Chunk 1: Baseline e contrato de diagnóstico

### Task 1: Congelar ambiente e baseline

**Files:**
- Create: `docs/superpowers/plans/2026-09-02-papyrus-pr27-android-ui-thread-scroll-contention.md`
- Create: `docs/performance/pr-27-android-ui-thread-scroll-contention.md`
- Read: `scripts/benchmarks/android-scroll-profile.sh`
- Read: `scripts/benchmarks/android-native-render-aggregate.mjs`

- [x] Confirmar `origin/main` em `fef42d947e108b6418e7c5033fcb931f29f7a499`.
- [x] Criar worktree exclusivo `codex/pr27-android-ui-thread-scroll-contention`.
- [x] Confirmar `emulator-5554` como Pixel 7/API 35 e ignorar o dispositivo físico.
- [x] Compilar/instalar o APK da base sem alterações de produto.
- [x] Executar `large-1000`, `perf=1`, três runs, e guardar logs apenas em `/tmp`.
- [x] Registrar frames, jank, P90/P95, missed-vsync, `uiQueue` e `request→surface` como baseline.

## Chunk 2: Instrumentação causal opt-in

### Task 2: Escrever testes do agregador de stalls primeiro

**Files:**
- Create: `scripts/benchmarks/android-ui-thread-stall-aggregate.mjs`
- Create: `scripts/benchmarks/android-ui-thread-stall-aggregate.test.mjs`

- [x] Adicionar fixture sintética com `ui.post`, `ui.start`, `scroll`, `surface.mount/unmount`, `viewer.viewable` e fases UIBlock.
- [x] Testar cálculo de `uiQueueMs`, `requestToSurfaceMs`, contagem de mounts e associação por `sampleId`/`renderRequestId`.
- [x] Testar classificação de stall com `uiQueueMs > 100` e resultado `INCONCLUSIVE` quando não houver evidência de trace.
- [x] Rodar o teste e confirmar RED antes da implementação.

### Task 3: Instrumentar UIBlock e Trace no native

**Files:**
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeRenderTelemetry.java`
- Test: `packages/engine-native/android/src/test/java/com/papyrus/engine/PapyrusNativeRenderTelemetryTest.java`

- [x] Emitir `native.render.uiblock.enqueue` antes de `addUIBlock`.
- [x] Emitir `native.render.uiblock.start` no início de `UIBlock.execute`.
- [x] Emitir `native.render.uiblock.surface.resolved` quando a `PapyrusPageView` for resolvida.
- [x] Fechar corretamente seções `PapyrusRenderUiBlock` e `PapyrusRenderUiCallback` com `try/finally`.
- [x] Adicionar `PapyrusSurfaceLayout`/`PapyrusPageDraw` somente quando telemetry estiver habilitada.
- [x] Preservar semântica e custo do caminho `perf=0`.
- [x] Estender testes para garantir que Trace/logs sejam opt-in e que contexto preserve IDs.
- [x] Rodar GREEN dos testes nativos antes de seguir.

### Task 4: Instrumentar mounts/layout relevantes no JS/native

**Files:**
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`
- Modify: `packages/ui-react-native/components/Viewer.tsx`
- Modify: `packages/ui-react-native/perf/mobilePerf.ts`

- [x] Reutilizar eventos existentes; não criar log por frame.
- [x] Garantir `surface.mount`, `surface.unmount`, `viewer.viewable`, `scroll.start/end` com o mesmo contexto de amostra.
- [x] Se necessário, adicionar contadores opt-in apenas para `PapyrusPageView` mount/layout, sem instrumentar a árvore inteira.
- [x] Adicionar testes unitários para agregação dos contadores, sem testes de inspeção textual.

## Chunk 3: Trace harness e análise

### Task 5: Adicionar coleta Perfetto/trace ao runner

**Files:**
- Create or modify: `scripts/benchmarks/android-ui-thread-trace.sh`
- Modify: `scripts/benchmarks/android-scroll-profile.sh`
- Modify: `scripts/benchmarks/README.md`

- [x] Capturar trace no `emulator-5554` com categorias disponíveis para sched/freq/idle/gfx/view/input/binder/memory/dalvik.
- [x] Registrar `trace off` e `trace on` com três runs de `large-1000` usando o mesmo protocolo.
- [x] Salvar traces grandes somente em `/tmp/papyrus-pr27-*`; versionar apenas resumos e timestamps relevantes.
- [x] Validar shell/node syntax e confirmar que tracing não fica ligado por default.

### Task 6: Implementar correlação e classificação

**Files:**
- Modify: `scripts/benchmarks/android-ui-thread-stall-aggregate.mjs`
- Modify: `scripts/benchmarks/android-ui-thread-stall-aggregate.test.mjs`
- Create: `docs/performance/pr-27-android-ui-thread-scroll-contention.md`

- [x] Agregar `large-100`, `large-1000` e `varied-sizes` sem misturar amostras.
- [x] Identificar stalls `uiQueue > 100 ms` e listar `request→surface`, mounts, unmounts, viewable range e contexto de scroll.
- [x] Extrair do trace somente slices efetivamente presentes, separando runnable atrasado de runnable longo.
- [x] Correlacionar, quando disponível, UIManager/Fabric, traversal, Choreographer, GC, JS, RenderThread/GPU e binder.
- [x] Classificar `RN_UI_MANAGER`, `FLATLIST_MOUNT`, `VIEW_TRAVERSAL`, `JS_COMMIT`, `GC`, `RENDER_THREAD_GPU`, `SYSTEM_MAIN_THREAD`, `MIXED` ou `INCONCLUSIVE`, com confiança.
- [x] Documentar hipóteses rejeitadas e não aplicar otimização especulativa.

## Chunk 4: Verificação e publicação

### Task 7: Smoke, build e relatório final

**Files:**
- Modify: `docs/performance/pr-27-android-ui-thread-scroll-contention.md`
- Modify: `scripts/benchmarks/README.md`

- [x] Rodar focused Node/JS tests, Android unit tests, builds dos pacotes e APK release.
- [x] Fazer smoke de abertura e scroll de PDF no `emulator-5554`.
- [x] Se não houver fix comportamental, não repetir pinch/rotation/jump além do smoke necessário.
- [x] Atualizar tabelas de baseline, trace overhead, stalls, top slices, UIBlock, mounts, GC/JS/RenderThread e classificação.

### Task 8: Publicar PR27 sem merge

- [x] Commitar somente arquivos da PR27.
- [x] Push da branch `codex/pr27-android-ui-thread-scroll-contention`.
- [x] Abrir PR contra `main` com evidências exatas e limitações.
- [x] Não fazer merge automaticamente.
