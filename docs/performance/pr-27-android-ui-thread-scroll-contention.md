# Papyrus PR27 — Android UI thread durante scroll de PDF

## Objetivo

Investigar, sem alterar o comportamento do reader, o intervalo entre o
`native.render.ui.post` e o início do callback na UI thread durante scroll no
Android compat. A PR adiciona telemetria opt-in, marcações nativas e um
agregador para correlacionar UIBlock, surface e eventos de scroll.

Nenhum tuning de `FlatList`, overscan, clipping, scheduler, executor, Pdfium
ou cache foi aplicado nesta PR.

## Ambiente e protocolo

- base: `main` em `fef42d947e108b6418e7c5033fcb931f29f7a499`;
- dispositivo: `emulator-5554`, Pixel 7, API 35, `x86_64`;
- pacote: `com.papyrus.sdk.mobileexpo`;
- caminho: Android `viewerMode=compat`;
- protocolo: fixture abre a frio, aguarda render inicial e executa quatro
  swipes verticais de 600 ms;
- `perf=1` para eventos Papyrus; artefatos grandes ficaram em `/tmp`.

O aparelho físico conectado (`6fe88ef10000`) não foi usado.

## Baseline large-1000

Coleta anterior à instrumentação, 3 execuções:

| Run | Frames | Janky | Janky % | P50 | P90 | P95 | Missed vsync |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 178 | 66 | 37,08% | 42 ms | 48 ms | 57 ms | 20 |
| 2 | 168 | 72 | 42,86% | 42 ms | 48 ms | 57 ms | 19 |
| 3 | 170 | 70 | 41,18% | 42 ms | 48 ms | 48 ms | 16 |

No baseline, os renders nativos tiveram `uiQueue` P50 de 12,87–26,31 ms,
P90 de 28,23–109,39 ms e `request → ready` P50 de 53,91–64,50 ms.

## Instrumentação adicionada

O native agora emite, somente com `perf=1`:

```text
native.render.uiblock.enqueue
native.render.uiblock.start
native.render.uiblock.surface.resolved
```

Também existem seções opt-in de `android.os.Trace` para UIBlock, cálculo da
surface, callback de UI e draw. O agregador calcula `ui.post → ui.start`,
`request → surface.resolved`, duração do UIBlock, atividade de mounts e
viewability, e classifica stalls apenas quando há slices de trace utilizáveis.

## Resultados por fixture

| Fixture | Renders completos | UI queue P50 | UI queue máximo | Stalls (>100 ms) | Request → surface P50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| `large-100` | 13 | 19,93 ms | 105,56 ms | 1 | 34,99 ms |
| `large-1000` trace on, 3 runs | 39 | 16,42 ms | 89,75 ms | 0 | 25,15 ms |
| `varied-sizes` | 4 | 2,71 ms | 8,13 ms | 0 | 32,13 ms |

Nos renders do `large-1000` com trace, o raster teve P50 entre 3,78 e
4,65 ms, o install ficou abaixo de 0,05 ms e o draw abaixo de 0,13 ms nas
três execuções. A maior espera observada foi no caminho de UIBlock/surface,
mas não há evidência suficiente para atribuí-la a uma categoria específica.

## Controle de overhead do trace

Mesmo APK, mesmo `emulator-5554`, `large-1000`, `perf=1`, quatro swipes,
3 execuções em cada grupo:

| Métrica mediana | Trace off | Trace on |
| --- | ---: | ---: |
| Frames | 181 | 178 |
| Janky % | 33,15% | 35,80% |
| P90 | 48 ms | 46 ms |
| P95 | 48 ms | 46 ms |
| Missed vsync | 27 | 2 |
| UI queue P50 | 18,95 ms | 19,34 ms |

Com apenas três amostras por grupo, há ruído natural no emulador. O jank
mediano variou 33,15% → 35,80%; P90/P95 ficaram iguais ou melhores no grupo
trace on, sem penalidade consistente de tracing. O trace on produziu três
arquivos Perfetto independentes, entre 9,8 e 10,3 MB.

## O que o trace provou e o que não provou

Os três arquivos Perfetto agora contêm as quatro seções customizadas, com 13
ocorrências de cada uma por run: `PapyrusRenderUiBlock`,
`PapyrusSurfaceLayout`, `PapyrusRenderUiCallback` e `PapyrusPageDraw`. Isso
confirma que `atrace_apps` habilitou a instrumentação do processo correto.
Eles também contêm eventos de `Choreographer#doFrame` e as fontes solicitadas
de scheduling/UI.

O agregador versionado recebe slices já extraídos em JSON; como o ambiente de
execução não possui `trace_processor_shell`, os `.pftrace` ainda não foram
convertidos em durações correlacionáveis por `renderRequestId`. Portanto, não
é correto publicar uma classificação de `RN_UI_MANAGER`, `VIEW_TRAVERSAL`,
`GC`, GPU ou outra categoria com base apenas na presença dos nomes. Os stalls
sem slice correlacionável continuam `INCONCLUSIVE`/baixa confiança.

Mesmo com as seções habilitadas, a PR ainda não distingue definitivamente
entre uma fila de tarefas pequenas e uma runnable longa, porque falta a
extração temporal do binário. A telemetria Papyrus delimita o intervalo e
mostra que o raster/draw medidos não o dominam, mas a atribuição da contenção
ainda exige essa correlação temporal.

## Conclusão

Não houve correção comportamental nesta PR e não há base para ajustar o
reader no escuro. O resultado acionável é:

- o custo medido de Pdfium raster, install e draw não explica sozinho a
  latência total;
- `large-1000` não apresentou stall acima de 100 ms nas três sessões com
  trace, embora o baseline tenha mostrado um P90 de UI queue acima desse
  limite em uma execução;
- `varied-sizes` não apresentou contenção relevante no protocolo curto;
- a captura das seções customizadas foi corrigida e validada, mas a
  classificação causal final permanece inconclusiva até extrair suas durações
  e correlacioná-las aos `renderRequestId`.

Próximo passo recomendado: corrigir a captura de slices do processo do app
ou adicionar uma fronteira nativa que seja exportada de forma correlacionável,
antes de qualquer otimização de scroll.
