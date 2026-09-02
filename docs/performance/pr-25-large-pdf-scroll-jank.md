# PR25 — resultado da investigação de scroll/jank de PDF no Android

## Escopo

Esta PR instrumenta, sem alterar a política de renderização, o caminho Android
`viewerMode="compat"`/`FlatList` para PDFs grandes. Pinch, rotação, distant
jump, outros formatos, web/iOS e o viewer nativo ficaram fora do escopo.

## Ambiente e execução

- Dispositivo: exclusivamente `emulator-5554`, `sdk_gphone64_x86_64`, Android
  15/API 35.
- APK: release construído no worktree da PR25.
- Protocolo: cold start, `perf=1`, `viewerMode=compat`, espera pelo lote
  inicial (`render.ready`), reset de `gfxinfo`, quatro swipes verticais de
  600 ms e captura imediata.
- Repetições: 3 por fixture.
- Script: [`scripts/benchmarks/android-scroll-profile.sh`](../../scripts/benchmarks/android-scroll-profile.sh).

## Resultado do baseline

Os valores são medianas das três execuções; os intervalos mostram o mínimo e
o máximo observados entre as execuções.

| Fixture | Frames | Janky % | P50 | P90 | P95 | Missed vsync | Slow UI | Slow draw | Attached views | Total PSS | Renders | Scrolls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `large-100` | 175 (172–178) | 39.43% (37.64–41.86) | 42 ms | 48 ms | 48 ms (48–53) | 22 (21–24) | 32 (28–36) | 69 (67–72) | 94 | 159641 KB (159577–159753) | 13 | 5 |
| `large-1000` | 172 (169–172) | 40.12% (38.37–41.42) | 42 ms (42–44) | 48 ms | 48 ms (48–53) | 19 (17–25) | 29 (28–30) | 69 (66–70) | 94 | 161556 KB (159390–161640) | 13 | 5 |
| `varied-sizes` | 145 (142–145) | 53.10% (51.03–55.63) | 48 ms | 61 ms | 61 ms | 52 (51–57) | 22 (21–28) | 77 (74–79) | 49 | 108575 KB (106776–108954) | 4 | 1 |

`small` possui uma página e não produz uma sessão de scroll real; foi usado
somente para verificar o caminho de carga e a instrumentação.

## Evidência causal

Cada execução longa registrou a cadeia completa de mount → request → start →
end → ready. Não apareceram `render.stale`, `render.abandoned` ou
`render.error`. O `large-1000` produziu as mesmas 13 renderizações e 94 views
anexadas do `large-100`, apesar de ter dez vezes mais páginas. Isso indica que
a virtualização não está explodindo com o tamanho do documento nesse caminho.

O contador `Slow issue draw commands` foi igual ao número de janky frames em
cada execução longa. `Slow bitmap uploads` ficou em zero no `large-1000` e no
`varied-sizes`; houve apenas uma ocorrência isolada no `large-100`. Os renders
individuais tiveram picos de até 183 ms no `large-100`, 605 ms em uma execução
do `large-1000` e 166 ms no `varied-sizes`, mas a captura não separa o trabalho
de rasterização nativa do traversal/draw da UI.

## Hipótese e decisão

A hipótese mais forte é custo de desenho/composição de native page surfaces
quando novas páginas entram na janela, possivelmente combinado com renders
individuais longos. A evidência **não** aponta para backlog/stale render,
upload de bitmap como causa dominante, ou renderização proporcional à
distância/tamanho do PDF.

Não foi aplicada uma alteração em `windowSize`, `maxToRenderPerBatch`,
overscan ou scheduler. Com estes dados, qualquer uma delas poderia trocar
jank por páginas ausentes e não isolaria se o custo está no raster nativo ou
no draw da árvore. A PR entrega instrumentação e um protocolo reproduzível;
uma otimização comportamental deve partir de uma próxima medição que marque
explicitamente raster start/end e surface promotion no lado Android, ou de um
experimento A/B controlado de pré-renderização.

## Limitações

- Fixtures são sintéticos e text-only; `varied-sizes` varia apenas as
  dimensões.
- `gfxinfo` é uma janela de quatro swipes, não um perfil de rolagem livre de
  longa duração.
- PSS e attached views são snapshots no final da janela, não picos.
- A métrica JS de scroll é auxiliar; os frames oficiais vêm de `gfxinfo`.
- Não há A/B de comportamento nesta PR porque nenhum fix foi aplicado.
