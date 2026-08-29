# Papyrus Zoom and Rendering Performance Design

**Status:** Proposed

## Goal

Melhorar pinch/zoom mobile e web para que o gesto use somente uma transformação visual barata sobre o conteúdo já renderizado, deixando o estado do documento, o engine e o render final para um único commit ao término do gesto.

## Confirmed current behavior

- O caminho mobile em `packages/ui-react-native/components/Viewer.tsx` atualiza o store e chama `engine.setZoom` em `updateViewerPinch`.
- PDFs que usam o viewer nativo seguem também `packages/ui-react-native/components/NativePdfDocumentViewer.tsx` e `packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java`, onde `ScaleGestureDetector`, `lastPageBitmap` e `renderGeneration` formam um caminho independente que precisa ser auditado e coberto pela mesma política.
- O caminho web em `packages/ui-react/components/Viewer.tsx` agenda `flushPinchZoom` por `requestAnimationFrame`, mas esse flush ainda chama `engine.setZoom` e atualiza o store durante o gesto.
- O mobile já possui helpers para cálculo de zoom, focal point e offsets, além de uma transformação de preview; a primeira etapa deve corrigir a fronteira entre preview e zoom confirmado, não substituir o engine.
- `PageRenderer` reage ao zoom confirmado para recalcular dimensões e chamar `renderPage`; esse caminho deve permanecer fora de `onUpdate`.

## Scope

### Included

1. Separar `previewZoom`/transformação efêmera de `committedZoom`/estado do documento em ambos os viewers RN (React Native e nativo Android) e no viewer web.
2. Impedir `setDocumentState`, `engine.setZoom`, `renderPage` e recálculo completo do documento durante `onUpdate`/`touchmove`.
3. Preservar o ponto focal e o offset de scroll no commit final.
4. Evitar que o preview exija atualização React por frame; usar a infraestrutura atual quando ela permitir uma mutação/transformação visual barata.
5. Coalescer ou cancelar renders finais obsoletos e manter bitmap/canvas anterior até o novo render estar pronto, evitando loading/flicker.
6. Tornar cálculo de layout, canvas budget e overscan determinísticos e limitados para zoom alto e documentos grandes, inicialmente somente onde uma medição reproduzir custo ou risco.
7. Adicionar testes de contrato e instrumentação para comprovar contagem de commits, chamadas de render/engine, tempo e uso de memória quando disponível.

### Excluded

- Reanimated/SharedValue como requisito da primeira implementação.
- Redesign visual, toolbar, search, safe-area e annotations fora da compatibilidade necessária.
- Troca do PDF.js, mudança do viewer nativo padrão e tile rendering completo sem evidência de necessidade.
- Alteração geral da API pública.

## Architecture

### Interaction state

O gesto manterá em refs/estado efêmero apenas o necessário para o preview: zoom inicial, escala visual, focal point, offsets iniciais e última amostra do gesto. Esse estado não será publicado no Zustand nem no `DocumentEngine` em cada atualização.

O preview deverá ser aplicado no contêiner da superfície renderizada por uma transformação visual barata. No RN React, a primeira opção será a infraestrutura de animação/transformação já presente no projeto, desde que a atualização não atravesse React por frame; não será aceito `setState(scale)` em cada `onUpdate`. No Android nativo, a transformação deverá permanecer no `View`/Canvas nativo e não virar evento JS por frame. No web, o preview deverá atualizar somente estilo/transformação da superfície e seu `transform-origin`, sem publicar zoom no store.

Se a infraestrutura atual não permitir uma transformação visual sem React/JS por frame, a fatia incremental deve parar nessa fronteira e registrar a necessidade de avaliar Reanimated/SharedValue (RN) ou uma camada equivalente (web), sem introduzir timers, mutations frágeis ou hacks DOM/native.

O focal point será definido em coordenadas da viewport. No início do gesto serão capturados focal point, scroll horizontal/vertical, superfície/página ancorada e zoom confirmado. Durante o preview, a transformação deverá manter esse ponto sob os dedos; no web isso inclui `transform-origin` e compensação explícita do scroll quando a superfície ultrapassar a viewport.

### Commit final

Em `onEnd`/`onFinalize`, o fluxo será protegido por uma guarda idempotente compartilhada. O fluxo será:

1. calcular e limitar o zoom final;
2. resolver o page index e os offsets que preservam o focal point;
3. publicar o zoom no store uma vez;
4. chamar `engine.setZoom` uma vez;
5. disparar o render final;
6. restaurar a transformação de preview somente quando o layout/render final estiver coerente.

`onEnd` com gesto válido confirma o último zoom. `onFinalize` apenas conclui o gesto se `onEnd` não tiver feito isso. `onCancel`/falha de reconhecimento descarta o preview, restaura a transformação inicial e não publica zoom nem chama `engine.setZoom`. Assim, cada gesto tem zero commits quando cancelado ou exatamente um quando confirmado.

O mesmo contrato será aplicado ao pinch web. Wheel com Ctrl/trackpad seguirá o comportamento existente, sem transformar o caminho em uma sequência de renders por evento.

### Rendering and memory

`PageRenderer`, os controladores de viewport e o viewer Android nativo devem manter a última superfície válida durante o render final. Cada render assíncrono deverá receber uma geração/token no dono da superfície; antes de escrever no canvas/bitmap ou promovê-lo como visível, o resultado deve verificar que ainda é a geração ativa. A troca para o resultado novo deve ser atômica do ponto de vista visual. O orçamento de canvas será limitado por dimensões e pixels, com fallback previsível para zoom alto. Overscan será calculado em função da janela e do custo estimado, sem multiplicação descontrolada em documentos grandes.

Essas mudanças serão feitas em helpers puros sempre que possível, preservando os contratos de engine e os resultados visíveis. A lista virtualizada continuará responsável por documentos grandes; não será feita uma refatoração geral de virtualização nesta rodada.

## Testing and instrumentation

Antes da implementação estrutural, adicionar testes vermelhos para:

- zero commits de store/engine/render durante updates de pinch;
- exatamente um commit final em `onEnd`/`onFinalize` para gesto confirmado e zero commits em cancelamento;
- focal point e offsets para zoom in/out, single/double e limites, em RN e web;
- coalescing/cancelamento de render obsoleto;
- retenção do bitmap anterior até o render final;
- limites de canvas e overscan em zoom alto;
- documento grande com número de páginas representativo, identificando o fixture como sintético quando for o caso.

Contratos iniciais mensuráveis:

- `setDocumentState`, `engine.setZoom` e `renderPage`: 0 chamadas durante updates; 1 commit de zoom e 1 chamada de `engine.setZoom` no fim de gesto confirmado;
- cancelamento: 0 commits e preview restaurado ao zoom inicial;
- focal point: erro máximo de 2 px em helpers determinísticos web e 2 dp em helpers RN, com tolerância de dispositivo registrada separadamente no smoke test;
- preview: nenhum commit React/árvore de páginas por update, verificado por contador de renders do componente e pelo contador de eventos;
- canvas: não estabelecer um limite arbitrário antes da medição; primeiro registrar dimensões/pixels e falhas no fixture, depois fixar o menor teto seguro no helper;
- overscan: comparar o conjunto de páginas montadas antes/depois e limitar o crescimento ao valor definido pelo helper, sem alegar ganho de memória sem medição;
- frame budget: usar 16,7 ms como referência de 60 Hz no smoke test, reportando separadamente dispositivos/refresh rates diferentes;
- fixture inicial: PDF sintético de 100 páginas para layout/render e PDF sintético de 1000 páginas para memória/long-document, ambos identificados como sintéticos.

Instrumentar contadores e duração para `pinch.start`, `pinch.update`, `pinch.commit`, `pinch.cancel`, `engine.setZoom`, `renderPage`, layout e descarte de resultados obsoletos. No Android nativo, incluir eventos equivalentes no caminho de `ScaleGestureDetector`/`renderGeneration`. Relatórios de performance deverão separar parsing/texto de renderização visual e registrar quando a medição é sintética. A aceitação inicial será baseada nos contadores; FPS e memória serão evidência adicional, não substituto dos contratos.

## Rollout and fallback

Implementar em fatias independentes: (1) contrato/helpers e caminho RN React, (2) viewer Android nativo, (3) web, (4) render/cache/layout somente para problemas reproduzidos. Se as métricas mostrarem que o preview ainda passa pela JS thread e perde frames, abrir uma segunda fatia para migrar somente `scale`/`translateX`/`translateY` para Reanimated/SharedValue no RN ou mecanismo equivalente no web. Essa migração não deve alterar o contrato de commit final nem o estado persistido do documento.

## Acceptance criteria

- Durante o gesto, nenhuma chamada a `setDocumentState`, `engine.setZoom` ou `renderPage` ocorre por update.
- O preview não provoca rerender da árvore de páginas por frame.
- Ao terminar, há exatamente um commit de zoom por gesto confirmado, zero em cancelamento, e o focal point permanece dentro das tolerâncias definidas acima.
- Renderizações obsoletas não sobrescrevem a superfície final; não há loading/flicker causado pelo commit de zoom.
- Canvas e overscan respeitam limites testados em zoom alto e documentos grandes.
- Mobile e web preservam os resultados atuais fora do comportamento de zoom.
