# Papyrus PR24 TXT Loading Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir que o carregamento de TXT no Android tenha uma conclusão observável, encerre o loading sem atrasos artificiais e não permita que loads antigos sobrescrevam o documento atual.

**Architecture:** Primeiro reproduzir o comportamento na `main` e mapear o fluxo real entre `MobileDocumentEngine`, WebView runtime, `Viewer` e store. Depois extrair somente a coordenação de geração/estado que for necessária, cobrindo-a com testes comportamentais, e aplicar a menor correção no caminho TXT. EPUB, CBR/CBZ e PDF serão apenas smokes de regressão.

**Tech Stack:** TypeScript, React Native/Expo, WebView runtime, Zustand, Vitest, Gradle e Android Emulator `emulator-5554`.

---

## Chunk 1: Baseline e mapa do fluxo

### Task 1: Confirmar estado isolado e fixtures

**Files:**
- Inspect: `examples/mobile-expo/App.tsx`
- Inspect: `examples/mobile-expo/perf/fixtureStartup.ts`
- Inspect: `examples/mobile-expo/fixtureRegistry.generated.ts`
- Inspect: `packages/engine-native/index.ts`
- Inspect: `packages/ui-react-native/components/Viewer.tsx`
- Inspect: `packages/ui-react-native/components/WebViewViewer.tsx`

- [x] **Step 1: Confirmar branch, SHA, worktree e emulador**

Run:

```bash
git status --short --branch
git show -s --format='%H %D %s' origin/main
git worktree list
adb -s emulator-5554 devices
```

Expected: branch `codex/pr24-text-loading-recovery`, base `origin/main` no merge da PR23, worktree limpo e `emulator-5554` disponível.

- [x] **Step 2: Localizar fixtures TXT/EPUB/CBR/CBZ/PDF existentes**

Run `rg --files` com extensões de fixture e registrar os caminhos versionados. Criar fixture novo somente se o baseline provar que os atuais não cobrem o cenário.

### Task 2: Reproduzir TXT na main-like

**Files:**
- Inspect: `examples/mobile-expo/App.tsx`
- Inspect: `packages/engine-native/index.ts`
- Inspect: `packages/ui-react-native/runtime/runtime.js`
- Create: `/tmp/pr24-baseline-*` runtime evidence only

- [x] **Step 1: Construir/instalar o example baseado na main**

Usar o procedimento Android já validado no repositório, sempre com `adb -s emulator-5554`.

- [x] **Step 2: Executar cold e warm TXT**

Registrar se `engine.load`, `getPageCount`, `document.ready`, `isLoaded` e conteúdo visível concluem. Repetir PDF → TXT, TXT → TXT, EPUB → TXT e TXT → PDF/EPUB quando o example permitir.

- [x] **Step 3: Capturar a fronteira exata do stall**

Separar erro de engine, mensagem WebView, estado do store e montagem do Viewer. Não adicionar correção durante esta etapa.

## Chunk 2: Contrato e testes comportamentais

### Task 3: Definir coordenação de load atual

**Files:**
- Create/Modify: helper puro no pacote que possuir a coordenação real
- Test: teste Vitest correspondente

- [x] **Step 1: Escrever testes que falham**

Cobrir load atual completo, load antigo superseded, erro atual, TXT sem `render.ready` de PDF e load vazio/inválido.

- [x] **Step 2: Implementar o mínimo para passar**

Sem `setTimeout`/`sleep` como sucesso, sem retry cego e sem falsificar evento de render.

- [x] **Step 3: Rodar testes focados e suíte afetada**

Esperado: comportamento novo coberto por runtime/testes, não por inspeção textual de source.

### Task 4: Corrigir o caminho de produção

**Files:**
- Modify: arquivo(s) identificados no baseline
- Test: testes do helper/runtime

- [x] **Step 1: Aplicar a menor correção causal**

Loading deve pertencer ao `documentLoadId`/generation atual e terminar por `content.ready`, `document.ready` ou `error` real.

- [x] **Step 2: Garantir cleanup/stale safety**

Trocas rápidas não podem publicar estado antigo nem deixar o loading do documento atual preso.

- [x] **Step 3: Rodar testes novamente**

## Chunk 3: Fixtures, smoke e documentação

### Task 5: Completar fixtures determinísticos apenas se necessário

**Files:**
- Create/Modify: `examples/mobile-expo/assets/...`
- Modify: registry/manifest/harness somente se necessário

- [x] **Step 1: Adicionar TXT Unicode/large/empty se não existirem**
- [x] **Step 2: Manter EPUB/CBR/PDF em smoke, sem expandir o escopo**

### Task 6: Validar Android e cross-format

**Files:**
- Create: `docs/performance/pr-24-text-loading-recovery.md`

- [x] **Step 1: Build/test do pacote e engine alterado**
- [x] **Step 2: Build APK e instalar somente no `emulator-5554`**
- [x] **Step 3: Executar 10 repetições do cenário TXT**
- [ ] **Step 4: Executar troca rápida e smokes EPUB/CBR/CBZ/PDF**
- [x] **Step 5: Registrar limitações e resultado real**

### Task 7: Revisão final e entrega

- [x] **Step 1: Rodar `git diff --check`, testes e builds finais**
- [x] **Step 2: Confirmar ausência de logs/fixtures auto-carregados temporários**
- [x] **Step 3: Atualizar descrição/relatório com evidência, sem inventar timings**
- [ ] **Step 4: Commitar e abrir PR24; não fazer merge automático**
