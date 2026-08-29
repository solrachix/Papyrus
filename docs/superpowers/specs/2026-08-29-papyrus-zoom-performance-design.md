# Papyrus Zoom and Rendering Performance Design

**Status:** Proposed

## Goal

Melhorar pinch/zoom mobile e web para que o gesto use somente uma transformação visual barata sobre o conteúdo já renderizado, deixando o estado do documento, o engine e o render final para um único commit ao término do gesto.

## Confirmed current behavior

- O caminho mobile em `packages/ui-react-native/components/Viewer.tsx` atualiza o store e chama `engine.setZoom` em `updateViewerPinch`.
- O caminho web em `packages/ui-react/components/Viewer.tsx` agenda `flushPinchZoom` por `requestAnimationFrame`, mas esse flush ainda chama `engine.setZoom` e atualiza o store durante o gesto.
- O mobile já possui helpers para cálculo de zoom, focal point e offsets, além de uma transformação de preview; a primeira etapa deve corrigir a fronteira entre preview e zoom confirmado, não substituir o engine.
- `PageRenderer` reage ao zoom confirmado para recalcular dimensões e chamar `renderPage`; esse caminho deve permanecer fora de `onUpdate`.

## Scope

### Included

1. Separar `previewZoom`/transformação efêmera de `committedZoom`/estado do documento.
2. Impedir `setDocumentState`, `engine.setZoom`, `renderPage` e recálculo completo do documento durante `onUpdate`/`touchmove`.
3. Preservar o ponto focal e o offset de scroll no commit final.
4. Evitar que o preview exija atualização React por frame; usar a infraestrutura atual quando ela permitir uma mutação/transformação visual barata.
5. Coalescer ou cancelar renders finais obsoletos e manter bitmap/canvas anterior até o novo render estar pronto, evitando loading/flicker.
6. Tornar cálculo de layout, canvas budget e overscan determinísticos e limitados para zoom alto e documentos grandes.
7. Adicionar testes de contrato e instrumentação para comprovar contagem de commits, chamadas de render/engine, tempo e uso de memória quando disponível.

### Excluded

- Reanimated/SharedValue como requisito da primeira implementação.
- Redesign visual, toolbar, search, safe-area e annotations fora da compatibilidade necessária.
- Troca do PDF.js, mudança do viewer nativo padrão e tile rendering completo sem evidência de necessidade.
- Alteração geral da API pública.

## Architecture

### Interaction state

O gesto manterá em refs/estado efêmero apenas o necessário para o preview: zoom inicial, escala visual, focal point, offsets iniciais e última amostra do gesto. Esse estado não será publicado no Zustand nem no `DocumentEngine` em cada atualização.

O preview deverá ser aplicado no contêiner da superfície renderizada por uma transformação visual barata. A implementação deve primeiro reutilizar a infraestrutura existente. Se ela exigir `setState` por frame e isso causar rerender de `Viewer`/árvore de páginas, a implementação deve parar nessa fronteira e registrar a necessidade de avaliar Reanimated/SharedValue, sem introduzir timers, mutations frágeis ou hacks DOM/native.

### Commit final

Em `onEnd`/`onFinalize`, o fluxo será:

1. calcular e limitar o zoom final;
2. resolver o page index e os offsets que preservam o focal point;
3. publicar o zoom no store uma vez;
4. chamar `engine.setZoom` uma vez;
5. disparar o render final;
6. restaurar a transformação de preview somente quando o layout/render final estiver coerente.

O mesmo contrato será aplicado ao pinch web. Wheel com Ctrl/trackpad seguirá o comportamento existente, sem transformar o caminho em uma sequência de renders por evento.

### Rendering and memory

`PageRenderer` e os controladores de viewport devem manter a última superfície válida durante o render final. Cada render assíncrono deverá ter uma geração/token; resultado de geração antiga não poderá substituir o resultado mais novo. O orçamento de canvas será limitado por dimensões e pixels, com fallback previsível para zoom alto. Overscan será calculado em função da janela e do custo estimado, sem multiplicação descontrolada em documentos grandes.

Essas mudanças serão feitas em helpers puros sempre que possível, preservando os contratos de engine e os resultados visíveis. A lista virtualizada continuará responsável por documentos grandes; não será feita uma refatoração geral de virtualização nesta rodada.

## Testing and instrumentation

Antes da implementação estrutural, adicionar testes vermelhos para:

- zero commits de store/engine/render durante updates de pinch;
- um commit final em `onEnd`, inclusive em cancelamento/finalização;
- focal point e offsets para zoom in/out, single/double e limites;
- coalescing/cancelamento de render obsoleto;
- retenção do bitmap anterior até o render final;
- limites de canvas e overscan em zoom alto;
- documento grande com número de páginas representativo, identificando o fixture como sintético quando for o caso.

Instrumentar contadores e duração para `pinch.start`, `pinch.update`, `pinch.commit`, `engine.setZoom`, `renderPage`, layout e descarte de resultados obsoletos. Relatórios de performance deverão separar parsing/texto de renderização visual e registrar quando a medição é sintética.

## Rollout and fallback

Implementar primeiro mobile com a infraestrutura atual, depois aplicar o mesmo contrato ao web. Se as métricas mostrarem que o preview ainda passa pela JS thread e perde frames em dispositivos representativos, abrir uma segunda fatia para migrar somente `scale`/`translateX`/`translateY` para Reanimated/SharedValue. Essa migração não deve alterar o contrato de commit final nem o estado persistido do documento.

## Acceptance criteria

- Durante o gesto, nenhuma chamada a `setDocumentState`, `engine.setZoom` ou `renderPage` ocorre por update.
- O preview não provoca rerender da árvore de páginas por frame.
- Ao terminar, há exatamente um commit de zoom por gesto válido e o focal point permanece dentro da tolerância definida pelos testes.
- Renderizações obsoletas não sobrescrevem a superfície final; não há loading/flicker causado pelo commit de zoom.
- Canvas e overscan respeitam limites testados em zoom alto e documentos grandes.
- Mobile e web preservam os resultados atuais fora do comportamento de zoom.
