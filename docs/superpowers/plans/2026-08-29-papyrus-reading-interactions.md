# Papyrus Reading Interactions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir apenas navegação, gestos de leitura, busca, seleção/copy, safe-area e uma base mínima de E2E/device tests do Papyrus.

**Architecture:** Extrair decisões puras para helpers testáveis e manter `Viewer`, `SearchOverlay`, `ReadingShell` e renderers como adaptadores finos. A navegação double guardará page index e list index separadamente; a busca terá cache por engine/documento, pool limitado e geração por request; o chrome usará uma decisão central de gesto; menus web serão renderizados numa camada de portal com collision; safe-area será centralizada no shell/métricas.

**Tech Stack:** TypeScript, React/React Native, Vitest, Jest do exemplo RN, Maestro apenas como fluxo declarativo opcional/local se já houver runner disponível.

---

## Chunk 1: Confirmar regressões e helpers puros

- [ ] Adicionar testes vermelhos para target double, chrome tap, busca concorrente/cache, clipboard, collision e safe-area.
- [ ] Executar os testes focados e registrar falhas esperadas.
- [ ] Implementar helpers mínimos e repetir até GREEN.

## Chunk 2: Integrar navegação/chrome/safe-area mobile

- [ ] Separar target de página e target de lista no retry do `packages/ui-react-native/components/Viewer.tsx`.
- [ ] Propagar um callback de tap de página que só alterna chrome quando não houver seleção, annotation, ferramenta ativa ou pinch recente.
- [ ] Centralizar insets em `mobileChromeMetrics`/`ReadingShell`, sem duplicar inset no host; ajustar Topbar, ProgressPill, BottomBar, SearchOverlay e sheets.

## Chunk 3: Busca e clipboard

- [ ] Implementar `SearchService` com cache por engine, concorrência interna 4 e request generation.
- [ ] Ligar `SearchOverlay` à proteção contra resultado stale.
- [ ] Usar uma ponte de clipboard pequena e injetável no `DedicatedAndroidPdfViewer`; fechar seleção somente depois de sucesso e preservar em erro.

## Chunk 4: Contextual UI web e E2E

- [ ] Renderizar selection menu/popovers web fora do clipping da página e calcular posição com collision de viewport.
- [ ] Reutilizar IDs existentes e adicionar marcadores necessários no exemplo mobile.
- [ ] Adicionar a menor base sustentável de device flows, preferindo Maestro se o runner estiver disponível; documentar execução e limitações.

## Chunk 5: Validação

- [ ] Executar testes focados, `pnpm test:phase1`, `pnpm lint:phase1`, `pnpm build`, Jest mobile e a nova suíte device quando possível.
- [ ] Revisar diff contra alterações preexistentes, sem modificar pinch/tiles/canvas/virtualização/viewerMode.
- [ ] Reportar cada ponto como confirmado/parcial/não reproduzido, evidências, pendências e limitações reais.
