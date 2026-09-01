# PDF Distant Jump Design

## Goal

Corrigir o caso em que um salto distante de página no Android `viewerMode=compat`/`FlatList` chega ao destino, mas deixa a superfície PDF branca.

## Scope

Incluído: Android, `emulator-5554`, `viewerMode=compat`, `FlatList`, virtualização, `goToPage`, `scrollToIndex`, `onScrollToIndexFailed`, mount de surface, gerações de render e render-ready.

Explicitamente fora: viewer nativo Android (`PapyrusPdfViewerView`), iOS, web, pinch, rotação, EPUB, TXT e CBR. Se a reprodução existir apenas no viewer nativo, a investigação será encerrada sem alterar esse caminho.

## Approach

Primeiro instrumentar a sequência existente, sem alterar comportamento. Cada salto será correlacionado por um `jumpId` e deverá distinguir independentemente: request, target na janela virtual, surface montada, posição de scroll atingida, render request, terminal e render-ready.

O estado pendente não exigirá `viewable` como condição única. `onViewableItemsChanged` será uma evidência possível; a conclusão deverá considerar as fronteiras observáveis disponíveis, especialmente surface montada, posição correta e `render.ready` do target.

Só depois de reproduzir o problema na `main` será implementada a menor correção causal. Retries serão adicionados apenas se os logs demonstrarem falha de layout/`scrollToIndex`; não serão usados sleeps ou retries cegos. O salto deve reposicionar diretamente a janela, mantendo custo O(tamanho da janela), não O(distância entre páginas).

## Diagnostic contract

Eventos opt-in devem carregar `jumpId`, `targetPage`, `currentPage`, `windowStart`, `windowEnd`, `surfaceId`, `renderRequestId` e `generation` quando disponíveis:

```text
jump.request
jump.window.update
jump.surface.available
jump.position.reached
jump.render.request
jump.render.ready
jump.complete
jump.timeout
```

O agregador deve classificar cada tentativa sem confundir `currentPage` com destino realmente renderizado. Um target sem terminal válido ou sem render-ready final permanece incompleto.

## Validation

Baseline na `main`: `large-100`, `large-1000` e `varied-sizes`, com saltos curtos e distantes. Repetir no mínimo 10 ciclos por cenário crítico, incluindo reversões e o teste em que um pequeno scroll supostamente “acorda” a página.

Depois da correção: focused tests, build dos pacotes alterados, APK Android, execução exclusivamente no `emulator-5554`, saltos `1 ↔ 1000` e verificação de ausência de renders intermediários proporcionais à distância, página branca, timeout, stale órfão, crash, ANR ou crescimento indefinido de memória.

## Stop conditions

Se `viewerMode=compat` não reproduzir o sintoma e os eventos apontarem para o viewer nativo, não haverá mudança especulativa nesta PR. O resultado será documentado como hipótese não aplicável ao escopo.
