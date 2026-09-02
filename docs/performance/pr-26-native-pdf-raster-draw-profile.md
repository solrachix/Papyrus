# PR26 — Native PDF raster → surface draw profiling

## Escopo

Instrumentação diagnóstica opt-in do caminho Android `viewerMode=compat` com
`PapyrusPageView`. O viewer nativo dedicado, pinch, rotação, jump e outros
formatos não fazem parte desta rodada.

## O que foi adicionado

- Contexto causal compartilhado entre `PageRenderer` e o render nativo:
  `renderRequestId`, `surfaceId`, `pageIndex`, `generation`, documento, fixture,
  run e sample.
- Marcadores nativos com `SystemClock.elapsedRealtimeNanos()` para resolução da
  surface, fila, Pdfium, cache, handoff para UI, instalação, invalidação e draw.
- Agregador determinístico com classificação de cache hit/miss, durações em ms e
  amostras incompletas quando faltam fases ou há duplicidade.
- Runner baseado no protocolo de quatro swipes da PR25, com `perf=0` como
  controle sem marcadores nativos.

## Validação Android

Ambiente: `emulator-5554`, APK release, fixture `large-1000`, `viewerMode=compat`,
três execuções por modo. O APK foi instalado e iniciado com sucesso.

| Métrica | `perf=0` mediana | `perf=1` mediana |
| --- | ---: | ---: |
| Frames | 179 | 178 |
| Janky frames | 61 | 62 |
| Jank | 34,08% | 34,83% |
| P50 | 40 ms | 42 ms |
| P90 | 48 ms | 48 ms |
| P95 | 48 ms | 48 ms |
| Missed vsync | 17 | 26 |
| PSS no snapshot | 160080 KB | 160467 KB |

O `perf=0` não produziu marcadores nativos. O `perf=1` produziu 13/13 renders
completos em cada uma das três execuções (`39/39` no total), sem amostras
incompletas. Na primeira execução agregada, por exemplo, o P50 de
`requestToReady` foi `171,07 ms`, `raster` `2,76 ms`, `uiQueue` `14,15 ms` e
`draw` `0,09 ms`; os valores são diagnósticos e não estabelecem causalidade.

O controle indica overhead pequeno para frames/jank nesta amostra, mas a
diferença de missed-vsync não deve ser generalizada a partir de apenas três
execuções. A PR não reivindica ganho de performance.

### Decomposição nativa

Depois de adicionar o marcador `native.render.surface.start`, foram feitas novas
execuções `perf=1` no mesmo `emulator-5554`, com uma execução por fixture. Todas
as amostras foram completas: `13/13` em `large-1000`, `13/13` em `large-100` e
`4/4` em `varied-sizes`.

Cada célula mostra `P50 / P90 / máximo`, em milissegundos:

| Fase | `large-1000` | `large-100` | `varied-sizes` |
| --- | ---: | ---: | ---: |
| request → surface | 12,54 / 24,76 / 185,43 | 23,91 / 41,43 / 42,44 | 18,20 / 20,39 / 20,39 |
| surface → enqueue | 0,12 / 0,44 / 1,90 | 0,09 / 0,32 / 0,52 | 0,06 / 0,35 / 0,35 |
| queue wait | 0,31 / 13,12 / 16,03 | 0,91 / 24,78 / 27,90 | 4,86 / 9,70 / 9,70 |
| lock wait | 0,02 / 0,05 / 0,05 | 0,03 / 0,05 / 0,11 | 0,04 / 0,06 / 0,06 |
| raster | 3,07 / 4,09 / 7,40 | 3,76 / 5,76 / 6,82 | 2,01 / 4,32 / 4,32 |
| UI queue | 41,52 / 422,54 / 425,27 | 25,41 / 41,96 / 43,91 | 421,10 / 457,79 / 457,79 |
| install | 0,04 / 0,06 / 0,08 | 0,02 / 0,04 / 0,04 | 0,03 / 0,08 / 0,08 |
| draw | 0,09 / 0,20 / 0,60 | 0,08 / 0,29 / 0,57 | 0,07 / 0,51 / 0,51 |
| request → ready | 207,86 / 442,02 / 442,30 | 68,29 / 94,16 / 96,73 | 449,33 / 487,85 / 487,85 |

Nesta coleta, a classificação é **MIXED**, com evidência mais forte em
`DISPATCH/UIBLOCK` (`request → surface`) e espera na **UI** (`uiQueue`).
Pdfium/raster, lock, instalação e draw são pequenos em comparação. Isso é uma
classificação diagnóstica da amostra, não uma prova isolada de causalidade.

O caminho de cache-hit agora é modelado sem `enqueue`: o contrato é
`request → surface.start → cache.hit → ui.start → install → invalidate → ready`.
O protocolo de scroll não gerou cache-hit nesta execução; o agregador e o teste
unitário cobrem essa forma diretamente e a classificam sem inventar espera de
fila.

## Testes e builds

- Agregador Node: 3 testes passando.
- Vitest focado de integração de render/contexto: 12 testes passando.
- Suíte Android nativa `:papyrus-sdk_engine-native:testDebugUnitTest`: 14 testes
  passando.
- Builds dos pacotes `types`, `core`, `engine-native` e `ui-react-native`:
  passando.
- APK release do `mobile-expo`: passando.
- `git diff --check`: passando.

A execução ampla via Vitest não foi usada como gate: ela tenta coletar testes
`.mjs` escritos para o Node como suítes Vitest e também encontrou duas falhas
ambientais preexistentes em `examples/web/App.phase1-shell.test.tsx` após a
instalação hoisted usada para o build Android.

## Limitações

`surface.swap` nativo não é inferido: a Promise de `renderPage` já representa a
surface instalada no contrato atual. Portanto os marcadores separam o caminho
até `render.ready` e o draw observado, mas não prometem uma fronteira nativa
independente de promoção da surface.

Os arquivos brutos de log permanecem fora do repositório em `/tmp`; este
relatório registra apenas os resultados resumidos e reproduzíveis.
