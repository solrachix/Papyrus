# PR25 — Large PDF scroll/jank no Android

## Objetivo

Medir e, somente se a evidência justificar, reduzir o custo do scroll contínuo
de PDFs grandes no caminho Android `viewerMode="compat"`/`FlatList`, sem
alterar pinch, rotação, EPUB/TXT/CBR/CBZ ou o viewer nativo dedicado.

## Decisão

1. Usar o `MobilePerf` existente como fonte de eventos do Viewer e do
   `PageRenderer`.
2. Delimitar cada sessão de scroll entre `onScrollBeginDrag`/`onMomentumScrollBegin`
   e `onScrollEndDrag`/`onMomentumScrollEnd`, registrando fixture, direção,
   duração e offset.
3. Correlacionar a sessão com os eventos de render já existentes por
   `pageIndex`, `generation`, `surfaceId` e `renderRequestId`, sem criar um
   scheduler paralelo.
4. Coletar no host Android `gfxinfo` e PSS com o mesmo protocolo antes/depois.
   A janela de frames deve excluir inicialização, menus e ociosidade fora do
   gesto.
5. Medir primeiro. Só depois do baseline escolher uma única causa dominante e
   aplicar a menor mudança possível, com teste unitário/runtime correspondente.

## Alternativas consideradas

- Ajustar `windowSize`, `maxToRenderPerBatch` ou overscan sem medição: rejeitado,
  pois pode esconder o problema e causar páginas ausentes.
- Adicionar um scheduler/priority queue global: rejeitado até existir evidência
  de fila de renders como causa dominante.
- Migrar novamente o gesto para Reanimated ou alterar o viewer nativo: fora do
  escopo e já investigado em rodadas anteriores.
- Instrumentar diretamente o renderer nativo primeiro: reservado para o caso
  em que os eventos JS e `gfxinfo` não distinguirem layout, rasterização e
  composição.

## Critérios de aceitação

- baseline atual reproduzível em `emulator-5554`;
- causa dominante documentada antes de qualquer otimização;
- A/B pareado, com pelo menos 3 execuções por lado;
- P50/P90/P95 de frame time, jank e FPS/duração reportados quando disponíveis;
- contagens de render, views anexadas e memória reportadas sem dados
  inventados;
- nenhum blank page, crash, ANR, regressão de virtualização, distant jump,
  rotação ou pinch;
- testes focados, build do pacote, APK release e smoke no emulator.

## Entregáveis

- `docs/performance/pr-25-large-pdf-scroll-baseline.md` após a medição inicial;
- `docs/performance/pr-25-large-pdf-scroll-jank.md` com causa, A/B e limitações;
- instrumentação opt-in e testes apenas onde forem necessários para explicar o
  baseline;
- branch publicada e PR aberta, sem merge automático.
