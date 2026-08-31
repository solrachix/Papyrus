# Android EPUB Loading Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Corrigir o carregamento EPUB no Android para que base64 e URI cheguem ao epub.js como `ArrayBuffer` exato e todo load termine em ready ou error observável.

**Architecture:** Manter a correção dentro do runtime WebView existente. Extrair conversão binária exata, instrumentar o pipeline com o envelope de eventos atual e associar cada load à sua requisição para ignorar callbacks obsoletos. Sincronizar `runtime.js` e `index.html` pelo script existente, sem alterar o algoritmo de scroll, PDF ou pinch.

**Tech Stack:** TypeScript, JavaScript WebView runtime, epub.js, Vitest, React Native WebView, Gradle/ADB.

---

### Task 1: Mapear o harness atual e fixtures

**Files:**
- Inspect: `packages/ui-react-native/runtime/runtime.js`
- Inspect: `packages/ui-react-native/runtime/index.html`
- Inspect: `packages/ui-react-native/runtime/syncComicRuntime.mjs`
- Inspect: `packages/ui-react-native/runtime/*.test.ts`
- Inspect: `examples/mobile/App.tsx`

- [ ] Step 1: Confirmar o comando oficial de sincronização e os pontos de entrada `kind: "load"`.
- [ ] Step 2: Confirmar fixtures EPUB base64 e URI/local file disponíveis no example.
- [ ] Step 3: Registrar no relatório de implementação a etapa observada no load atual.

### Task 2: Conversão binária exata com TDD

**Files:**
- Create/Modify: `packages/ui-react-native/runtime/epubRuntime.test.ts`
- Modify: `packages/ui-react-native/runtime/runtime.js`

- [ ] Step 1: Escrever teste para bytes completos produzirem `ArrayBuffer` com mesmo conteúdo.
- [ ] Step 2: Escrever teste para `Uint8Array` deslocado produzir buffer sem bytes externos.
- [ ] Step 3: Rodar os testes e confirmar falha pela ausência do helper/export de teste.
- [ ] Step 4: Implementar `toExactArrayBuffer(bytes)` e usar em `sourceToArrayBuffer`/caminho EPUB base64.
- [ ] Step 5: Rodar os testes e confirmar aprovação.

### Task 3: Instrumentar pipeline e garantir terminais

**Files:**
- Modify: `packages/ui-react-native/runtime/runtime.js`
- Modify: `packages/engine-native/index.ts` somente se o bridge precisar propagar `document.error`.
- Modify: `packages/ui-react-native/runtime/epubRuntime.test.ts`

- [ ] Step 1: Escrever testes para sucesso, rejeição, timeout e load concorrente com um terminal por `loadId`.
- [ ] Step 2: Rodar os testes e confirmar falhas esperadas.
- [ ] Step 3: Implementar eventos opt-in no envelope `{ type: "event", name, payload }`.
- [ ] Step 4: Associar eventos e `document.ready`/`document.error` ao `id` da requisição `kind: "load"`.
- [ ] Step 5: Adicionar timeout de 10 s por etapa crítica, terminando em `error` sem declarar `ready`.
- [ ] Step 6: Ignorar callbacks de geração anterior e remover qualquer swallow de rejeição no load EPUB.
- [ ] Step 7: Rodar os testes focados e a suíte relevante.

### Task 4: Sincronizar artefatos e validar contratos

**Files:**
- Modify: `packages/ui-react-native/runtime/runtime.js`
- Modify: `packages/ui-react-native/runtime/index.html`
- Modify: `packages/ui-react-native/runtime/comicRuntime.test.ts` ou novo teste de paridade

- [ ] Step 1: Executar `pnpm --filter @papyrus-sdk/ui-react-native exec node runtime/syncComicRuntime.mjs`.
- [ ] Step 2: Adicionar/ajustar teste que confirme a correção relevante nos dois artefatos.
- [ ] Step 3: Rodar build do pacote e garantir `git diff --check` limpo.

### Task 5: Validar Android no emulator-5554

**Files:**
- Evidence: `/tmp/papyrus-pr19-*.png` e logs locais; não versionar logs brutos.
- Update: `docs/performance/` somente se já houver relatório apropriado no repositório.

- [ ] Step 1: Reproduzir o load EPUB na `main`/baseline da worktree e coletar logs.
- [ ] Step 2: Compilar e instalar debug, apontando Metro para uma porta livre.
- [ ] Step 3: Executar EPUB base64 e URI/local file; confirmar conteúdo visível e scroll baixo/cima.
- [ ] Step 4: Compilar release, instalar e repetir os dois caminhos no `emulator-5554`.
- [ ] Step 5: Abrir PDF padrão e confirmar regressão ausente.
- [ ] Step 6: Registrar resultado e limitações na PR.

### Task 6: Commit, push e abrir PR

**Files:**
- All files changed by Tasks 2–5.

- [ ] Step 1: Rodar testes finais e build final.
- [ ] Step 2: Revisar diff para manter somente o escopo EPUB loading.
- [ ] Step 3: Commitar mudanças com mensagem focada.
- [ ] Step 4: Publicar branch e abrir PR contra `main` com evidências de debug/release.
