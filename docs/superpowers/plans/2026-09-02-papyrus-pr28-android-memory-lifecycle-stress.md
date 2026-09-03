# Papyrus PR28 Android Memory/Lifecycle Stress Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir e validar que abertura, troca, fechamento e reabertura repetidos de documentos no Android mantêm memória e recursos bounded, corrigindo somente leak comprovado.

**Architecture:** Reutilizar o protocolo de fixtures e a telemetria existente de render. Adicionar um runner de stress orientado a cenários, checkpoints de `dumpsys meminfo`/logcat e um agregador puro para slopes, tendências e contadores de lifecycle. O runner não introduzirá `System.gc()`, limpeza global, sleeps mágicos ou mudanças de política de cache.

**Tech Stack:** Bash/ADB, Node.js, NDJSON, React Native/Expo Android, Java/JUnit, PSS/native heap/Dalvik heap.

---

## Chunk 1: Ambiente, mapa e baseline

### Task 1: Congelar base e instalar o APK release

**Files:**
- Read: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java`
- Read: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java`
- Read: `packages/engine-native/index.ts`
- Read: `packages/ui-react-native/components/PageRenderer.tsx`
- Read: `scripts/benchmarks/android-scroll-profile.sh`

- [x] Confirmar `origin/main`, branch, worktree e `emulator-5554` API 35.
- [x] Instalar dependências em modo compatível com o example, sem alterar manifest/package/lock.
- [x] Usar APK release da mesma base PR27; rebuild desta worktree foi tentado e ficou bloqueado por falha preexistente do example/engine-rust.
- [x] Registrar SHA base, APK/package, device/API e modo `viewerMode=compat`.

### Task 2: Baseline frio de memória

**Files:**
- Create: `docs/performance/pr-28-android-memory-lifecycle-baseline.md`

- [x] Abrir `small` em cold start e aguardar o render inicial.
- [x] Capturar `dumpsys meminfo`, PID e logcat sem alterar o comportamento do app.
- [x] Registrar PSS, native heap, Dalvik/Java heap, graphics, views e activities.
- [x] Documentar warm-up e limitações antes do stress.

## Chunk 2: Runner e agregação test-first

### Task 3: Contrato do agregador de checkpoints

**Files:**
- Create: `scripts/benchmarks/android-lifecycle-stress-aggregate.test.mjs`
- Create: `scripts/benchmarks/android-lifecycle-stress-aggregate.mjs`

- [x] Escrever fixture sintética de checkpoints, resources e ciclos e confirmar RED.
- [x] Testar slope pós-warm-up, pico/final, tendência monotônica e classificação `HEALTHY`/`INCONCLUSIVE`.
- [x] Testar que PSS isolado não vira leak e que recursos bounded são separados de crescimento suspeito.
- [x] Implementar o agregador mínimo e confirmar GREEN.

### Task 4: Runner de lifecycle Android

**Files:**
- Create: `scripts/benchmarks/android-lifecycle-stress.sh`
- Modify: `scripts/benchmarks/README.md`

- [x] Aceitar `--device`, `--scenario`, `--cycles`, `--package`, `--output-dir`.
- [x] Reutilizar fixtures existentes e salvar por ciclo meminfo/gfxinfo/logcat/events em `/tmp`.
- [x] Implementar checkpoints 0/1/5/10/20 quando aplicável, sem `System.gc()`, cache clear ou sleep arbitrário.
- [x] Implementar somente ações determinísticas de abrir/trocar/background/foreground/rotate e coletar evidências.
- [x] Manter `perf=0` no stress principal e permitir `perf=1` apenas no controle curto.

## Chunk 3: Instrumentação apenas se a medição revelar lacuna

### Task 5: Auditar owners e contadores existentes

**Files:**
- Modify only if required: `packages/engine-native/index.ts`
- Modify only if required: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java`
- Modify only if required: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java`
- Modify only if required: `packages/ui-react-native/components/PageRenderer.tsx`

- [x] Auditar document identity/generation/terminal render nos eventos existentes.
- [x] Confirmar que engines, active renders, cache bytes/entries, active bitmap refs e pending bridge requests não estavam expostos de forma confiável no harness atual.
- [x] Não adicionar contadores diagnósticos porque nenhum recurso essencial ficou sem evidência para a decisão desta rodada.
- [x] Não houve leak reproduzido; nenhum fix de produto foi criado.

## Chunk 4: Stress, análise e correção mínima

### Task 6: Executar cenários obrigatórios

**Files:**
- Runtime artifacts only: `/tmp/papyrus-pr28-*`

- [x] Executar reopen `small` 20 ciclos.
- [x] Executar alternância `small ↔ large-100` 20 trocas.
- [x] Executar reopen `large-1000` 10 ciclos com scroll curto.
- [x] Executar cross-format PDF/TXT/EPUB por 10 ciclos.
- [x] Executar background/foreground 20 vezes e render interrompido.
- [x] Executar troca durante render 10 vezes.
- [x] Executar reverse revisit e smoke de orientação.
- [x] Executar long stress 10 ciclos e cold restart final.
- [x] Executar controle curto com `perf=0` no stress e `perf=1` em rodada diagnóstica separada.

### Task 7: Classificar tendência e decidir se há fix

**Files:**
- Create: `docs/performance/pr-28-android-memory-lifecycle-stress.md`

- [x] Consolidar checkpoints brutos e slope pós-warm-up por cenário.
- [x] Classificar cenários saudáveis ou inconclusivos quando a amostra foi curta; não inferir owners sem contador.
- [x] Verificar logcat para crash/ANR/OOM/recycled bitmap/WindowLeaked e PID antes/depois.
- [x] Como não houve leak reproduzido, manter a PR sem mudança comportamental.
- [x] Não aplicável: nenhum leak exigiu teste/fix before/after.

## Chunk 5: Verificação e publicação

### Task 8: Regressão e gates

**Files:**
- Modify: `docs/performance/pr-28-android-memory-lifecycle-stress.md`

- [x] Rodar focused Node/JS tests; a suíte global também foi tentada e manteve falhas preexistentes de ambiente/testes.
- [x] Fazer smokes PDF, rotation, TXT, EPUB e trocas cross-format dentro do runner; distant jump/pinch não foram objetivo desta PR.
- [x] Confirmar `git diff --check`, `bash -n` e `node --check`.
- [x] Não usar o POCO/dispositivo físico.

### Task 9: Publicar PR28 sem merge

**Files:**
- Modify: `docs/performance/pr-28-android-memory-lifecycle-stress.md`

- [ ] Commitar somente arquivos scoped da PR28.
- [ ] Push da branch `codex/pr28-android-memory-lifecycle-stress`.
- [ ] Abrir PR contra `main` com resultados, limitações e decisão de merge.
- [x] Não fazer merge automaticamente.
