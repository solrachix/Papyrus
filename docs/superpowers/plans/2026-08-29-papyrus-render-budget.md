# Papyrus Render Budget Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o render final do Papyrus previsível em zoom alto e PDFs grandes, descartando renders obsoletos e limitando custo real de rasterização.

**Architecture:** Criar helpers puros para geração, orçamento de pixels e overscan. Cada `PageRenderer` terá geração própria e promoverá somente o resultado mais recente; o PDF.js cancelará tarefas anteriores quando possível. O layout lógico continuará usando o zoom solicitado, enquanto o raster físico será limitado por pixels, dimensão e DPR.

**Tech Stack:** TypeScript, React, React Native, PDF.js, Android Java/Kotlin, Vitest, Gradle.

---

## Chunk 1: Render generation and cancellation

**Files:**
- Create: `packages/core/renderGeneration.ts`
- Test: `packages/core/renderGeneration.test.ts`
- Modify: `packages/engine-pdfjs/index.ts`
- Test: `packages/engine-pdfjs/index.test.ts`
- Modify: `packages/ui-react/components/PageRenderer.tsx`
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`

- [ ] Escrever testes para latest-render-wins e cancelamento tardio.
- [ ] Implementar token/generation pequeno e explícito.
- [ ] Auditar `RenderTask.cancel()` no PDF.js e cancelar a tarefa anterior por canvas.
- [ ] Aplicar guard de geração antes de promover canvas, text layer, dimensões e callbacks.
- [ ] Aplicar o mesmo contrato nos efeitos web e RN sem incluir callback instável nas dependências.
- [ ] Rodar testes focados e commitar.

## Chunk 2: Raster pixel budget and DPR

**Files:**
- Create: `packages/ui-react/components/renderBudget.ts`
- Test: `packages/ui-react/components/renderBudget.test.ts`
- Modify: `packages/ui-react/components/PageRenderer.tsx`
- Modify: `packages/engine-pdfjs/index.ts`

- [ ] Escrever testes para DPR 1/2/3, limite de pixels, limite de dimensão e escala lógica preservada.
- [ ] Implementar `resolveRasterBudget` centralizado com saída de escala, dimensões físicas, pixels e clamp.
- [ ] Usar o orçamento no canvas PDF.js mantendo CSS/layout no zoom lógico.
- [ ] Documentar a perda controlada de nitidez como alternativa a alocações inviáveis.
- [ ] Rodar build e testes focados; commitar.

## Chunk 3: Adaptive overscan and renderer isolation

**Files:**
- Create: `packages/ui-react/components/renderOverscan.ts`
- Test: `packages/ui-react/components/renderOverscan.test.ts`
- Modify: `packages/ui-react/components/Viewer.tsx`
- Modify: `packages/ui-react/components/PageRenderer.tsx`
- Modify: `packages/ui-react-native/components/Viewer.tsx`
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`

- [ ] Escrever testes determinísticos para overscan baixo/médio/alto e páginas caras.
- [ ] Implementar overscan orientado por zoom, viewport, pixels estimados e DPR.
- [ ] Separar dependências de raster de estados de UI irrelevantes.
- [ ] Instrumentar mounted/render requested/render ready e active tasks sem alterar o contrato visual.
- [ ] Auditar operações de layout RN para evitar varreduras repetidas de todas as páginas.
- [ ] Rodar testes focados e commitar.

## Chunk 4: Android native and large-document validation

**Files:**
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`
- Modify: `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java`
- Test: `packages/engine-native/runtimeSource.test.ts`
- Add or extend: synthetic large-document benchmark/fixture under the existing test structure.

- [ ] Escrever casos para geração Android, bitmap antigo preservado, limite de bitmap e falha previsível de allocation.
- [ ] Corrigir promoção stale e aplicar limite de bitmap sem esconder OOM em estado inválido.
- [ ] Validar fixtures sintéticos de 100, 500, 1000 e 5000 páginas, reportando-as como sintéticas.
- [ ] Compilar Java/Android e rodar todos os testes/lint/build.
- [ ] Atualizar documentação da PR com métricas reais e limitações.

## Final validation

- [ ] `pnpm test:phase1`
- [ ] `pnpm lint:phase1`
- [ ] `pnpm build`
- [ ] `./gradlew :app:compileDebugJavaWithJavac`
- [ ] `git diff --check` e estado limpo antes da PR.
