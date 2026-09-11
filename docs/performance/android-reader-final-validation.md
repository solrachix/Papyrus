# Android reader — relatório geral de validação

**Data da consolidação:** 2026-09-10  
**Repositório:** `solrachix/Papyrus`  
**Dispositivo principal das validações Android:** `emulator-5554`  
**Dispositivo físico usado na validação manual:** POCO (`6fe88ef10000`)

## Contexto para continuidade por outro agente

Esta investigação envolve dois repositórios relacionados:

1. **Papyrus SDK** — `/home/carlos/projects/thoth/Papyrus`
   - biblioteca e componentes reutilizáveis do reader;
   - arquivos principais do problema atual:
     - `packages/ui-react-native/components/Viewer.tsx`;
     - `packages/ui-react-native/components/ProgressPill.tsx`;
     - `packages/ui-react-native/components/ReadingShell.tsx`;
     - `packages/ui-react-native/components/pageScrubberModel.ts`;
     - `packages/ui-react-native/components/viewerNavigation.ts`;
     - `packages/ui-react-native/index.ts`;
   - o relatório atual está em
     `docs/performance/android-reader-final-validation.md`;
   - estado observado nesta consolidação: `main` em `e8858d7`, com alterações
     locais não commitadas relacionadas ao reader.

2. **Thoth Stack** — `/home/carlos/projects/thoth/thoth-stack`
   - aplicativo que consome o Papyrus e onde a regressão foi observada no uso
     real;
   - procurar a tela mobile de leitura, a integração de `Viewer`/`ProgressPill`
     e o callback equivalente a `navigateToReaderPage`;
   - validar no aplicativo do Thoth, especialmente no POCO (`6fe88ef10000`),
     e não apenas no example Android do Papyrus.

O problema funcional deve ser analisado nos dois lados do contrato:

```text
Papyrus: ProgressPill → onNavigateToPage → Viewer → scroll nativo
Thoth: tela de leitura → integração do componente → estado/callback do documento
```

Não assumir que uma validação positiva no example do Papyrus prova que a
integração do Thoth está correta. O sintoma atual é justamente o desacoplamento
entre o contador visual e o conteúdo realmente visível no aplicativo consumidor.

## Resumo executivo

O ciclo técnico do reader Android, cobrindo as PRs 20–29, foi concluído no
exemplo do Papyrus. As validações registradas cobrem carregamento de formatos,
pinch, saltos distantes, rotação, virtualização de PDFs grandes,
instrumentação nativa, investigação de UI thread, lifecycle e
reprodutibilidade do build Expo 52 com `pnpm` isolated.

O resultado não autoriza afirmar que o scroll de PDF grande está perfeito: o
jank permaneceu no emulador, mas as investigações não encontraram um owner
causal reproduzível para tuning seguro. Esse item fica como backlog de
performance, condicionado a uma reprodução mais determinística e a um profiler
com correlação causal.

Há, porém, uma regressão posterior na integração usada pelo Thoth. O estado
local atual do Papyrus está com alterações não commitadas em `Viewer`,
`ProgressPill`, `ReadingShell`, `NativeSheet` e nos modelos de interação. Nessa
versão, o contador lateral pode atualizar visualmente, mas o PDF não acompanha
a página escolhida; em uma rodada mais recente, o arraste lateral também deixou
de navegar. Portanto o ciclo histórico está fechado, mas a integração atual
não deve ser tratada como release-ready até esse contrato ser corrigido e
validado novamente no Thoth.

## Estado por etapa

| Etapa | Resultado | Observação |
| --- | --- | --- |
| PR20 — EPUB reverse scroll | ✅ Validada | Scroll reverso e carregamento do formato cobertos no example. |
| PR21 — pinch/render-ready | ✅ Validada | Pinch e fronteira `render.ready` cobertos. |
| PR22 — distant jump/clipping | ✅ Validada | Salto distante e clipping Android compat; render nativo não precisou mudar. |
| PR23 — rotação Android | ✅ Validada | Raster compat limitado, ownership de bitmap e dispose no unmount. Smoke e matriz de rotações passaram. |
| PR24 — TXT/lifecycle | ✅ Validada | Erro de loading terminal, proteção stale/generation e smokes de formatos. |
| PR25 — PDF grande/jank | ✅ Investigada | Baseline reproduzível; nenhuma otimização especulativa aplicada. |
| PR26 — raster → draw profiling | ✅ Investigada | Raster, lock, install e draw não explicam sozinhos a latência total. |
| PR27 — UI thread/Perfetto | ✅ Investigada | Slices customizados presentes; não houve stall causal reproduzível. Classificação final: `INCONCLUSIVE`. |
| PR28 — memory/lifecycle stress | ✅ Validada | Mesmo PID, sem crash/ANR/OOM/recycled bitmap; counters bounded após warm-up. |
| PR29 — Expo 52/pnpm isolated | ✅ Validada | Build release limpo reproduzido, autolinking verificado e APK gerado. |

## Conclusões técnicas do ciclo

- O raster Pdfium não foi identificado como gargalo dominante.
- Espera de lock não foi identificada como gargalo dominante.
- Instalação de bitmap e `Canvas.drawBitmap()` não foram identificados como
  gargalos dominantes.
- A virtualização manteve uma quantidade bounded de views anexadas.
- O stress de lifecycle estabilizou depois do aquecimento da janela nativa.
- Não houve leak reproduzível de bitmap, engine, documento ou request pendente.
- Não houve crash, ANR, OOM ou `recycled bitmap` nos cenários finais
  registrados.
- O jank residual do scroll continua sem causa suficientemente reproduzível
  para justificar tuning de `windowSize`, overscan, scheduler ou render nativo.

### Evidência de memória/lifecycle

No cenário `long`, `activeBitmapRefs` cresceu de `8` para `15` somente durante
o preenchimento da janela nativa e estabilizou a partir do ciclo 10 até o 20.
O cache permaneceu com no máximo 6 entradas, o PID permaneceu constante e as
views ativas ficaram bounded. Isso foi classificado como warm-up/steady state,
não como leak confirmado.

### Evidência de profiling

No `large-1000`, a decomposição registrada mostrou raster, lock, instalação e
draw pequenos frente ao tempo total. O intervalo mais relevante ficou entre a
requisição e a resolução da surface/UIBlock e na fila da UI, mas as capturas
não permitiram atribuir causalidade a uma categoria específica do Android.

## Regressão atual do controle de páginas no Thoth

### Sintoma observado

Ao escolher uma página pelo contador lateral ou pelo seletor de páginas:

1. o contador pode mudar para a página escolhida;
2. o PDF continua visualmente na página antiga, frequentemente a página 1;
3. o scroll manual dentro do PDF continua funcionando;
4. em uma rodada posterior, o arraste no controle lateral também deixou de
   mover o conteúdo ou navegar.

### O que isso significa

Existem duas fontes de verdade que ficaram desacopladas:

```text
estado lógico: currentPage = 14
conteúdo nativo: contentOffset ainda em page 1
```

O fluxo lógico chega a atualizar o contador:

```text
ProgressPill
→ navigateToReaderPage(page)
→ engine.goToPage(page)
→ currentPage = page
→ Viewer recebe scrollToPageSignal
```

Mas o comando final para o `FlatList`/`ScrollView` vertical não está produzindo
o deslocamento real, ou está sendo sobrescrito pela hierarquia de scroll
nested. A implementação atual tenta `getNativeScrollRef().scrollTo` e
`scrollToOffset`, mas a evidência de UI mostra que o alvo lógico mudou sem que
as páginas visíveis mudassem. O fato de o scroll manual funcionar descarta
cache, PDF inválido e layout completamente quebrado; o problema está na
ponte entre navegação programática, gesto do scrubber e scroll nativo.

### Causa ainda não fechada

O owner exato ainda não foi provado. As hipóteses prioritárias são:

- o `onNavigateToPage` não estar chegando ao `Viewer` usado pelo Thoth;
- o comando programático estar sendo executado antes da lista vertical estar
  pronta e não ser reaplicado na fronteira correta;
- a hierarquia `horizontal ScrollView → vertical FlatList/ScrollView` estar
  recebendo o comando no ref errado;
- o estado `programmaticScrollActive`/bloqueio de gesto estar re-renderizando
  ou sobrescrevendo o deslocamento;
- o `ProgressPill` estar capturando o gesto, mas apenas atualizando o preview
  local sem completar a navegação real.

Esse diagnóstico ainda não deve ser convertido em uma afirmação causal única.

## Estado do código e da publicação

No momento desta consolidação:

- `main` aponta para `e8858d7` (`release: bump Android reader packages`);
- existem alterações locais não commitadas em 12 arquivos, incluindo o
  `Viewer` e o `ProgressPill`;
- o pacote local `@papyrus-sdk/ui-react-native` está em `0.2.29`, enquanto o
  changelog versionado registra a publicação anterior como `0.2.27`;
- não há evidência nesta rodada de que essa versão local já tenha sido
  publicada no npm;
- nenhum novo commit deve ser considerado release até passar pelo teste de
  navegação real no Thoth e pelo smoke no POCO.

As mudanças locais de build em `examples/mobile/android` pertencem à
reprodutibilidade Expo 52/pnpm isolated e devem ser preservadas, mas não devem
ser confundidas com a correção do scrubber.

## Gate atual

| Gate | Estado |
| --- | --- |
| Reader Papyrus no example | ✅ Histórico validado |
| PDF grande, pinch, jump distante e rotação | ✅ |
| TXT, EPUB e troca de formatos | ✅ |
| Memory/lifecycle stress | ✅ |
| Build release limpo | ✅ Histórico validado |
| Scroll manual no Thoth | ✅ |
| Contador atualiza | ✅ Parcial |
| Navegação programática para a página escolhida | ❌ |
| Arraste lateral integrado ao scroll real | ❌ Regressão atual |
| Pacote local atual pronto para publicar | ❌ |
| Roadmap técnico histórico PR20–PR29 | ✅ Encerrado |
| Release da integração atual no Thoth | ⚠️ Bloqueado pela regressão acima |

## Próximas ações recomendadas

1. Instrumentar uma única navegação `page 1 → page 14` no Thoth e comprovar,
   no mesmo evento, `onNavigateToPage`, `scrollToPageSignal`, ref vertical,
   offset calculado e `contentOffset` posterior.
2. Corrigir o caminho que controla o scroll vertical real, mantendo o gesto do
   scrubber isolado do scroll natural do PDF.
3. Repetir no emulator e no POCO: toque no contador, arraste para cima/baixo,
   seleção de página no bottom sheet e navegação manual após o salto.
4. Só depois atualizar versão/changelog, publicar os pacotes dependentes na
   ordem correta e atualizar o Thoth.
5. Manter o jank de PDF grande como backlog separado, sem misturá-lo com essa
   regressão funcional de navegação.

## Limpeza posterior não bloqueante

- corrigir a suíte ampla que tenta coletar módulos `.mjs` de Node via Vitest;
- revisar as falhas preexistentes de `examples/web/App.phase1-shell.test.tsx`;
- confirmar que toda a instrumentação de performance permanece opt-in;
- avaliar uma CLI única para os scripts de benchmark.
