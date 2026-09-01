# PDF Distant Jump Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Fazer saltos distantes no PDF compat/FlatList Android concluírem somente quando o destino tiver posição, surface e render válidos.

**Architecture:** Instrumentar primeiro o fluxo existente com um `jumpId`, sem alterar a navegação. Modelar as evidências do jump como estados independentes; implementar apenas a correção explicada pelo baseline. Manter o viewer nativo fora da mudança.

**Tech Stack:** React Native 0.81, TypeScript, FlatList, Zustand, Vitest, Gradle/ADB, scripts de benchmark Android.

---

### Task 1: Mapear e congelar o baseline

**Files:**
- Inspect: `packages/ui-react-native/components/Viewer.tsx`
- Inspect: `packages/core/store.ts`
- Inspect: `scripts/benchmarks/android-pinch-profile.sh`
- Create later: `docs/performance/pr-22-pdf-distant-jump.md`

- [ ] Confirmar `origin/main`, worktree, packageId e somente `emulator-5554`.
- [ ] Executar smoke de `large-1000` em `viewerMode=compat`.
- [ ] Rodar saltos curtos/distantes e capturar tela/logcat sem alterar código.
- [ ] Registrar se o sintoma ocorre no compat; se não ocorrer, parar a investigação de código e documentar o resultado.

### Task 2: Escrever testes de diagnóstico e contrato

**Files:**
- Create: `packages/ui-react-native/components/pdfJumpDiagnostics.ts`
- Test: `packages/ui-react-native/components/pdfJumpDiagnostics.test.ts`

- [ ] Testar que um jump mantém estados independentes: window, surface, posição e ready.
- [ ] Testar que `viewable` pode ser ausente quando as outras evidências são suficientes.
- [ ] Testar que um target stale/incompleto não conclui o jump.
- [ ] Rodar o teste e confirmar falha antes da implementação.

### Task 3: Instrumentar o fluxo FlatList sem mudar semântica

**Files:**
- Modify: `packages/ui-react-native/components/Viewer.tsx`
- Modify: `packages/ui-react-native/components/PageRenderer.tsx` apenas se a correlação de mount/ready exigir
- Modify: `packages/ui-react-native/perf/perfSession.ts` apenas se tipos forem necessários
- Test: `packages/ui-react-native/components/pdfJumpDiagnostics.test.ts`

- [ ] Criar `jumpId` por request e emitir eventos opt-in com target, current page, janela, surface, request e generation.
- [ ] Instrumentar `scrollToIndex`, `onScrollToIndexFailed`, viewable target, render request/terminal e mount/unmount.
- [ ] Não adicionar sleeps, retries ou mudanças de algoritmo nesta etapa.
- [ ] Validar que o modo `native` não recebe esses eventos nem alterações.

### Task 4: Agregar evidência e confirmar a causa

**Files:**
- Create or modify: `scripts/benchmarks/android-jump-aggregate.mjs`
- Test: `scripts/benchmarks/android-jump-aggregate.test.mjs`
- Modify: `scripts/benchmarks/android-pinch-profile.sh` only if a reusable jump runner is needed

- [ ] Correlacionar request → window → surface → position → render terminal/ready.
- [ ] Classificar target fora da janela, falha de layout, stale sem replacement e surface sem render.
- [ ] Adicionar contagem de páginas/render requests para provar O(window), não O(distância).
- [ ] Criar relatório baseline com evidência de cada cenário e do pequeno scroll posterior.

### Task 5: Implementar a menor correção causal

**Files:**
- Modify only the proven production files from Tasks 3–4
- Test: focused tests for the proven failure mode

- [ ] Se for layout failure, corrigir fallback/retry condicionado ao callback real, no máximo uma vez por request.
- [ ] Se for janela/surface ordering, recentralizar o target e preservar o jump pendente até surface/ready.
- [ ] Se for stale/latest-wins, garantir replacement explícito do target.
- [ ] Não renderizar índices intermediários e não adicionar delays arbitrários.

### Task 6: Validar no emulator-5554

**Files:**
- Update: `docs/performance/pr-22-pdf-distant-jump.md`

- [ ] Rodar focused tests, build dos pacotes e Android APK.
- [ ] Validar `large-100`, `large-1000` e `varied-sizes`.
- [ ] Repetir no mínimo 10 ciclos dos saltos críticos e 20 saltos alternados no stress.
- [ ] Confirmar página correta, sem branco, timeout, stale órfão, crash/ANR e sem renders intermediários.
- [ ] Capturar memória/views attached quando disponível.

### Task 7: Verificação e entrega

- [ ] Rodar `git diff --check` e suíte focada/final.
- [ ] Confirmar worktree limpo e diff limitado ao escopo compat/FlatList.
- [ ] Commitar em partes pequenas, push da branch e abrir PR22 sem merge automático.
- [ ] Descrever claramente baseline, causa comprovada, correção e limitações.
