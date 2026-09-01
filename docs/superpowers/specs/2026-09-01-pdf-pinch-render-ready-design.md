# PDF Pinch Render-Ready Investigation Design

## Goal

Medir e explicar o tempo entre o commit final de zoom e a surface PDF pronta no Android, sem alterar o algoritmo do gesto ou introduzir uma otimização especulativa.

## Scope

Esta rodada cobre somente o caminho pós-gesture no `emulator-5554`: commit de zoom, agendamento, render nativo e ready. O contrato atual resolve `renderPage()` depois da instalação da bitmap; a troca nativa da surface não é observável nesta camada. O gesto visual, focal point, Reanimated, matemática de pinch e engine de EPUB ficam fora do escopo.

## Approach

Reutilizar `scripts/benchmarks/android-pinch-profile.sh` e as fixtures existentes (`small`, `large-100`, `large-1000`, `varied-sizes`). A instrumentação deve emitir timestamps causais e IDs de render para distinguir render duplicado, render stale/cancelado, custo de bitmap e espera por batch. Primeiro será executada a matriz baseline da `origin/main`, com pelo menos cinco amostras válidas por fixture/direção. Só haverá alteração de comportamento depois de uma causa ser demonstrada.

## Data contract

Cada sessão deve permitir correlacionar `pinch.commit`, `zoom.set`, `render.request`, `render.start`, `render.end`, `render.ready` e terminais `cancelled`/`stale`/`error`. Quando disponível, registrar zoom, DPR, dimensões lógicas e alvo estimado do bitmap, pixel count, página e geração. O relatório deve agregar P50/P90, contagem de renders e cancelamentos, sem confundir duração da sessão com duração de render.

## Validation

Comparar `pinch-in` e `pinch-out` em todas as fixtures, verificar que há um commit por gesto, identificar renders duplicados e confirmar que o custo permanece proporcional às páginas relevantes. Repetir a mesma matriz após qualquer mudança. A validação visual no emulador deve cobrir pinch, scroll subsequente, fronteira de página e `large-1000`, observando flicker, tela branca, clipping e bitmap permanentemente borrado.

## Expected deliverables

- baseline versionado da `origin/main`;
- instrumentação testável por IDs, não apenas inspeção textual;
- relatório antes/depois somente se houver correção causal;
- recomendação explícita de merge ou de próxima investigação.
