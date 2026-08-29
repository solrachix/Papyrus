# Papyrus PR 13 — Real-world performance validation and instrumentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Medir o comportamento real do Papyrus em browser e Android após as PRs 11 e 12, produzindo evidência comparável para decidir a próxima otimização.

**Architecture:** A PR 13 adicionará observabilidade opt-in e um protocolo reproduzível de cenários, sem alterar a política de renderização por antecipação. Web e Android emitirão eventos com o mesmo vocabulário lógico — commit de zoom, surface pronta, render ativo/cancelado/stale, janela montada, jump, scroll, memória e frames — enquanto coletores específicos capturarão as métricas disponíveis em cada runtime. O resultado será um relatório versionado que separa fatos medidos, limitações e decisão recomendada para a PR 14.

**Tech Stack:** TypeScript, React, React Native, Chrome Performance API/PerformanceObserver, Android `adb`, `dumpsys meminfo`, `dumpsys gfxinfo`, Gradle, Vitest, fixtures PDF sintéticos e Markdown/JSON.

---

## Escopo e unidades de arquivo

- `packages/core/perfTelemetry.ts`: contrato comum de eventos, relógio monotônico, normalização e agregação local; não fará logging por padrão.
- `packages/core/perfTelemetry.test.ts`: testes puros para ordenação, duração, contadores e snapshots incompletos.
- `packages/ui-react/perf/webPerf.ts`: coletor web opt-in para marks/measures, frames, long tasks, DOM/canvas e memória disponível.
- `packages/ui-react/perf/webPerf.test.ts`: testes com APIs ausentes e mocks de `PerformanceObserver`/`requestAnimationFrame`.
- `packages/ui-react/components/Viewer.tsx` e `PageRenderer.tsx`: pontos estreitos de instrumentação para zoom, surface pronta, render ativo/stale e janela montada.
- `packages/ui-react-native/perf/mobilePerf.ts`: extensão do coletor existente para o mesmo contrato, memória Hermes e eventos de gesto/scroll/render.
- `packages/ui-react-native/components/Viewer.tsx` e `PageRenderer.tsx`: pontos de instrumentação RN, sem mudar a lógica do gesto.
- `packages/engine-native/android/.../PapyrusPageView.java` e `PapyrusPdfViewerView.java`: métricas nativas de duração, bitmap e promoção, protegidas pelo modo opt-in.
- `scripts/benchmarks/generate-large-pdf.mjs`: extensão compatível do gerador para perfis text-heavy, varied-size e image-heavy, sem adicionar PDFs de terceiros ao repositório.
- `scripts/benchmarks/perf-fixtures.mjs`: catálogo/manifesto dos fixtures e hashes.
- `scripts/benchmarks/web-perf.mjs`: verificação/coleta orientada ao navegador e serialização do resultado.
- `scripts/benchmarks/android-perf.sh`: protocolo `adb` para meminfo, gfxinfo, logcat e repetição dos cenários.
- `scripts/benchmarks/README.md`: comandos, pré-requisitos, formato e limitações.
- `docs/performance/pr-13-real-world-validation.md`: relatório comparativo final, somente com números capturados e marcados por runtime/dispositivo.

## Fase 1: contrato de telemetria e fixtures reproduzíveis

**Objetivo:** criar a base que permite comparar web e Android sem introduzir uma nova otimização.

### Tarefa 1.1 — Definir eventos e agregação

**Arquivos:** criar `packages/core/perfTelemetry.ts` e `packages/core/perfTelemetry.test.ts`.

- [x] Escrever testes falhando para eventos com `runId`, `scenario`, `runtime`, `timestampMs`, `scope`, `name` e payload; cobrir duração commit→surface-ready, contadores e eventos fora de ordem.
- [x] Rodar `pnpm exec vitest run packages/core/perfTelemetry.test.ts` e confirmar falha por módulo ausente.
- [x] Implementar um recorder em memória opt-in com `mark`, `measure`, `increment`, `sample` e `snapshot`; limitar o contrato a dados serializáveis.
- [x] Garantir que o recorder desabilitado não leia memória, não faça `console.log` e não altere o caminho de renderização.
- [x] Rodar o teste focado e confirmar PASS.
- [x] Rodar `pnpm exec vitest run packages/core/perfTelemetry.test.ts packages/core/renderGeneration.test.ts packages/core/renderBudget.test.ts`.

### Tarefa 1.2 — Catalogar fixtures

**Arquivos:** modificar `scripts/benchmarks/generate-large-pdf.mjs`; criar `scripts/benchmarks/perf-fixtures.mjs`.

- [x] Escrever o manifesto esperado para `small-20`, `medium-200`, `large-1000`, `image-heavy`, `varied-sizes` e `text-heavy`, incluindo páginas, perfil e SHA-256.
- [x] Rodar o manifesto antes da implementação para confirmar que os perfis adicionais ainda não existem.
- [x] Estender o gerador com perfis determinísticos: texto repetido para text layer pesada, `/MediaBox` alternado para alturas/larguras variadas e imagens sintéticas embutidas para image-heavy; manter o fixture gerado em diretório temporário.
- [x] Implementar geração/validação do catálogo sem aceitar arquivo cujo hash ou quantidade de páginas não corresponda ao manifesto.
- [x] Rodar `node scripts/benchmarks/perf-fixtures.mjs --output /tmp/papyrus-pr13-fixtures` e verificar os hashes e a contagem de páginas.
- [x] Documentar que fixtures sintéticos medem o pipeline, não representam distribuição real de PDFs.

## Fase 2: instrumentação web e validação de virtualização

**Objetivo:** medir os quatro números principais no browser e provar que PDFs de 5000 páginas mantêm DOM O(window).

### Tarefa 2.1 — Instrumentar Viewer/PageRenderer

**Arquivos:** criar `packages/ui-react/perf/webPerf.ts` e teste; modificar `packages/ui-react/components/Viewer.tsx` e `packages/ui-react/components/PageRenderer.tsx`.

- [x] Escrever testes para o coletor sem `performance.memory`, sem `PerformanceObserver` e sem `requestAnimationFrame` disponível.
- [x] Implementar o coletor web opt-in por `globalThis.__PAPYRUS_WEB_PERF__` ou query flag explícita, com `performance.mark/measure` quando disponíveis.
- [x] Marcar `pinch.commit`, `surface.ready`, `jump.start/end`, `scroll.start/end`, `render.start/end/cancel/stale` e `viewer.window` sem incluir funções instáveis nas dependências de render.
- [x] Medir frames durante pinch com contador de frames, maior intervalo entre frames e frames acima de 16,67/33,33 ms; não chamar isso de FPS de hardware quando for apenas amostragem JS.
- [x] Coletar `document.querySelectorAll('.page-container').length`, canvases, PageRenderers observáveis e `performance.memory` apenas quando o browser oferecer a API.
- [x] Adicionar um export JSON manual (`window.__PAPYRUS_WEB_PERF__.snapshot()`) com ambiente, fixture, viewport, DPR e commit SHA.
- [x] Rodar testes web focados e `pnpm lint:phase1`.

### Tarefa 2.2 — Criar protocolo browser

**Arquivos:** criar `scripts/benchmarks/web-perf.mjs`; modificar `scripts/benchmarks/README.md`.

- [x] Definir o protocolo para cada fixture: abrir, zoom 1→5→1 por 20 ciclos, scroll rápido, jumps 1→500→999, orientação simulada quando disponível e captura antes/depois.
- [ ] Adicionar cenários específicos 5000 páginas: DOM inicial, scroll para meio/fim, retorno ao início, páginas de alturas variadas e ausência de buracos/alteração violenta do `scrollTop`.
- [ ] Integrar a captura com um navegador real usando o fluxo do skill `browser:control-in-app-browser` ou navegador local equivalente; se não houver sessão automatizável, registrar o comando/manual flow e não fabricar resultado.
- [x] Serializar um JSON por execução e um resumo Markdown com `zoom commit → sharp surface`, frame drops, peak memory, jump latency, wrappers e PageRenderers.
- [ ] Rodar uma execução smoke no PDF de 20 páginas e verificar que os campos indisponíveis ficam explícitos.

### Tarefa 2.3 — Validar o caso overscan zero

**Arquivos:** testar `packages/ui-react/components/viewerVirtualization.ts` e, se necessário, adicionar `packages/ui-react/components/viewerVirtualization.runtime.test.ts`.

- [ ] Escrever um teste que simule âncora 100, `renderOverscan=0`, wrappers anterior/âncora/próxima e uma transição de interseção para a próxima página.
- [ ] Montar o Viewer com engine fake apenas se o ambiente de teste conseguir controlar `IntersectionObserver`; caso contrário, manter o teste puro e registrar a lacuna como runtime browser.
- [ ] Confirmar que só a janela de render recebe `PageRenderer`, que a vizinha tem `data-page-index` e que a mudança de página recalcula a janela sem perder a posição de scroll.
- [ ] Rodar o teste focado e o teste de shell web existente.

## Fase 3: instrumentação Android e coleta no aparelho/emulador

**Objetivo:** medir bitmap final, memória, GC, jank e repetição de operações no runtime Android real.

### Tarefa 3.1 — Instrumentar render nativo

**Arquivos:** modificar `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPageView.java` e `PapyrusPdfViewerView.java`; estender `packages/ui-react-native/perf/mobilePerf.ts`.

- [ ] Escrever testes JVM/contratos para modo desligado, duração de render, bytes do bitmap promovido, geração e descarte stale.
- [ ] Implementar logging nativo opt-in com prefixo estável, `SystemClock.elapsedRealtimeNanos`, índice da página, geração, dimensões e `getAllocationByteCount` quando disponível.
- [ ] Registrar explicitamente OOM/falha de render como evento de erro com superfície anterior preservada, sem transformar erro em sucesso.
- [ ] Alinhar eventos RN de pinch, zoom commit, surface ready, scroll, jump e orientation ao contrato core.
- [ ] Rodar testes JVM/contratos e `./gradlew :app:compileDebugJavaWithJavac`.

### Tarefa 3.2 — Criar coletor `adb`

**Arquivos:** criar `scripts/benchmarks/android-perf.sh`; modificar `scripts/benchmarks/README.md`.

- [ ] Validar dispositivo único com `adb devices` e falhar claramente quando não houver aparelho/emulador autorizado.
- [ ] Capturar PID/pacote `com.papyrusmobile`, `dumpsys meminfo`, `dumpsys gfxinfo`, `logcat` filtrado e timestamps antes/depois de cada operação.
- [ ] Implementar cenários: zoom 1→5→1 20 vezes, scroll 1→100→300→1, jumps 1→900→50→999, orientação e abrir/fechar documento grande repetido.
- [ ] Forçar uma amostra de idle após cada ciclo para observar se a memória retorna; reportar pico e baseline, sem afirmar que `dumpsys` é memória exclusiva do PDF.
- [ ] Exportar JSON/CSV com modelo Android, API, ABI, build, fixture, temperatura se disponível e número de repetições.
- [ ] Rodar smoke em PDF pequeno e verificar que o relatório distingue `device/emulator`, comandos executados e métricas indisponíveis.

## Fase 4: stress, relatório e decisão da próxima PR

**Objetivo:** produzir uma conclusão auditável e impedir que números sintéticos virem justificativa para uma otimização sem gargalo comprovado.

### Tarefa 4.1 — Repetir stress e checar retenção

**Arquivos:** criar `scripts/benchmarks/run-pr13-stress.mjs`; criar `docs/performance/pr-13-real-world-validation.md`.

- [ ] Definir matriz mínima: 20 páginas, 200 páginas, 1000+ páginas, image-heavy, varied-sizes e text-heavy; executar cada cenário em browser e Android quando o runtime suportar o fixture.
- [ ] Repetir pinch, scroll, jump e orientation conforme o protocolo, com pelo menos três repetições por combinação e sem misturar warm-up com amostra.
- [ ] Calcular mediana, p95, mínimo/máximo e quantidade de execuções válidas para commit→surface-ready, frame drops, peak memory e jump latency.
- [ ] Verificar wrappers DOM O(window), PageRenderers limitados, ausência de buracos e estabilidade de `scrollTop` nas capturas web.
- [ ] Verificar tendência de memória após idle nos ciclos Android e registrar GC/logcat sem atribuir causalidade além do observado.
- [ ] Manter separados números de parsing/texto, rasterização e UI; nenhum benchmark sintético substitui a prova de render em runtime real.

### Tarefa 4.2 — Fechar relatório e decisão

**Arquivos:** modificar `docs/performance/pr-13-real-world-validation.md` e `scripts/benchmarks/README.md`.

- [ ] Criar tabela por runtime/dispositivo/fixture com os quatro números principais e intervalos de confiança apenas quando houver amostras suficientes.
- [ ] Listar limitações: API de memória ausente, browser sem captura automatizada, Android sem aparelho, fixture sintético, status incompleto ou operação não executada.
- [ ] Escolher no máximo uma recomendação PR 14 com base no gargalo dominante: concorrência/cache, tiles, Reanimated, prefix sums web, text layer, scheduling PDF.js ou bitmap pool.
- [ ] Se todos os cenários estiverem dentro das metas e sem tendência de retenção, registrar explicitamente “não alterar performance” como resultado válido.
- [ ] Rodar a revisão final com `@verification-before-completion`, `git diff --check`, `pnpm test:phase1`, `pnpm lint:phase1`, `pnpm build` e Gradle; anexar os comandos e versões ao relatório.

## Critérios de saída da PR 13

- [ ] Há pelo menos uma execução real documentada no browser e, se houver dispositivo disponível, uma execução real no Android; quando impossível, a ausência está explícita.
- [ ] `zoom commit → sharp surface`, frame drops, peak memory e jump latency têm definição, unidade, runtime e número de amostras.
- [ ] O cenário 5000 páginas mostra contagem observada de wrappers/DOM e comportamento de scroll, não apenas uma inspeção de source.
- [ ] Nenhuma métrica indisponível é preenchida com estimativa apresentada como resultado real.
- [ ] A PR 13 não introduz tiles, Reanimated, novo cache ou mudança de scheduling sem que o relatório primeiro demonstre o gargalo.
