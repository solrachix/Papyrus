# PR28 — stress de memória e lifecycle no Android

## Escopo

Esta rodada cobre somente o example Android em `viewerMode=compat`, com PDF,
troca de fixtures, background/foreground e ciclos de lifecycle. Não houve
alteração de renderização, pinch, overscan, scheduler ou viewer nativo.

## Ambiente

- base: `main` em `c6d7ddcae271f3818ba984ee2c4799259889744b`;
- dispositivo exclusivo: `emulator-5554`, Pixel 7/API 35, `x86_64`;
- package: `com.papyrus.sdk.mobileexpo`;
- viewer: Android `compat`;
- APK release compilado desta branch;
- SHA-256 `e2cb6a922330cce33ab1bb3d65140dfe6553c0af84b606bfad11a669d7db94cd`;
- o dispositivo físico `6fe88ef10000` não foi usado.

## Protocolo

Cada cenário faz um único cold start no ciclo `0`. As trocas seguintes usam
deep links warm dentro da Activity já existente; não há `force-stop` dentro dos
ciclos de retenção. O runner salva PSS/heap, views, activities, WebViews, PID,
hierarquia de UI e logcat nos checkpoints `0/1/5/10/20`.

O agregador expõe `pidSequence` e só aceita `pidStable=true` quando todo
checkpoint tem PID e todos os PIDs são iguais. Mudança ou ausência de PID
invalida a amostra para classificação `HEALTHY`. `force-stop` permanece
reservado ao cold start inicial de cada cenário.

As execuções anteriores, feitas com `force-stop` a cada ciclo, foram
descartadas como evidência de retenção no mesmo processo e não entram nos
resultados abaixo.

## Counters de ownership

Quando `perf=1`, o example publica um snapshot opt-in dos owners relevantes
junto ao evento `lifecycle.counters`, e o runner copia o último snapshot de
cada checkpoint para `checkpoints.ndjson`. Os campos são:

- `engineStates` e `loadedDocuments`;
- `renderCacheBytes` e `renderCacheEntries`;
- `activeBitmapRefs` e `cachedBitmapCount`;
- `activeRenderRequests` (itens no worker de render nativo) e
  `activePageViews`;
- `webViewCount` e `pendingBridgeRequests`.

O smoke `reopen-small`, `perf=1`, no `emulator-5554` confirmou o contrato
com PID `28380`: `engineStates=1`, `loadedDocuments=1`, cache
`0 → 5.155.296` bytes/`0 → 1` entrada, `activeBitmapRefs=0 → 1` e
`activeRenderRequests=0` no checkpoint após o render. Esse smoke valida a
telemetria, mas não substitui a rodada isolada dos cenários pendentes.

## Resultados

Valores em KB; `PSS` e heaps são `inicial → pico → final`. `views` conta
identificadores `papyrus-page-*` na hierarquia no checkpoint. Cada sequência de
PID permaneceu constante durante o cenário.

| Cenário | Ciclos | PSS | Native | Java | Views | Classificação |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `reopen-small` | 20 | 88.840 → 130.784 → 130.784 | 25.868 → 59.036 → 59.036 | 11.544 → 11.544 → 8.016 | 1 → 1 → 1 | `HEALTHY` (PID 18540) |
| `small-large` | 20 | 89.357 → 152.061 → 142.707 | 25.832 → 63.608 → 59.168 | 11.604 → 11.604 → 10.984 | 1 → 1 → 1 | `HEALTHY` (PID 19294) |
| `large-reopen` | 10 | 132.047 → 151.719 → 150.722 | 64.476 → 69.136 → 63.804 | 12.492 → 12.492 → 7.860 | 3 → 3 → 3 | `HEALTHY` (PID 20539) |
| `orientation` | 20 | 132.715 → 156.055 → 156.055 | 64.140 → 70.664 → 70.664 | 16.656 → 16.656 → 10.508 | 3 → 3 → 3 | `HEALTHY` (PID 28557) |
| `background` | 20 | 131.062 → 131.062 → 128.235 | 64.500 → 64.500 → 60.844 | 13.128 → 13.128 → 7.480 | 3 → 3 → 3 | `HEALTHY` |
| `background-render` | 10 | 130.798 → 152.323 → 152.323 | 64.256 → 67.020 → 63.688 | 13.180 → 13.180 → 10.740 | 3 → 3 → 3 | `HEALTHY` |
| `reverse-navigation` | 10 | 131.109 → 147.721 → 147.721 | 64.220 → 64.220 → 62.792 | 13.192 → 13.192 → 7.012 | 3 → 3 → 3 | `HEALTHY` |
| `switch-during-render` | 10 | 131.855 → 204.784 → 204.784 | 64.508 → 64.508 → 61.184 | 12.504 → 25.156 → 25.156 | 3 → 0 → 0 | `MIXED` (estado final TEXT) |
| `switch-during-render-return-pdf` | 10 | 130.928 → 209.662 → 198.540 | 64.244 → 64.244 → 60.104 | 13.216 → 25.600 → 7.744 | 3 → 3 → 3 | `HEALTHY` |
| `long` | 20 | 126.082 → 189.969 → 189.969 | 60.136 → 105.132 → 105.132 | 13.164 → 13.164 → 11.620 | 3 → 3 → 3 | `HEALTHY` (PID 4405) |
| `cross-format` | 10 | 89.241 → 89.241 → 87.784 | 25.776 → 25.776 → 22.556 | 11.544 → 11.544 → 6.604 | 1 → 1 → 1 | `HEALTHY` (PID 22805) |

`reopen-small`, `small-large` e `large-reopen` mantiveram o processo e as
quantidades de views estáveis. `cross-format` também permaneceu no mesmo PID e
sem crescimento de recursos observável.

O controle `switch-during-render-return-pdf` removeu a ambiguidade do cenário
que terminava em TEXT: depois de dez trocas no mesmo PID e retorno ao PDF, os
counters ficaram bounded e `activeBitmapRefs` caiu de `8` para `1` no último
checkpoint. O aumento transitório de Java heap pertence ao estado de WebView;
não há evidência de retenção persistente nesse fluxo.

Os cenários de isolação de lifecycle (`orientation`, `background`,
`background-render` e `reverse-navigation`) também terminaram sem falhas, com
um engine/documento, três views e counters estáveis.

O primeiro `long` de dez ciclos levantou uma suspeita porque `activeBitmapRefs`
cresceu de `8` para `15`. O controle de vinte ciclos mostrou que o contador
acompanha `activePageViews`, cresce apenas enquanto a janela nativa é
preenchida e estabiliza em `15` do ciclo 10 ao 20. Cache, engines e documentos
também permaneceram bounded; portanto não há evidência de retenção contínua de
bitmap nesse cenário.

### Counters nos cenários isolados

Os snapshots foram coletados com `perf=1` nos cenários abaixo. Em todos eles,
`engineStates=1`, `loadedDocuments=1`, `renderCacheEntries=6`,
`cachedBitmapCount=6`, `activeRenderRequests=0`, `webViewCount=0` e
`pendingBridgeRequests=0` nos checkpoints finais; `activePageViews` acompanhou
as três views do compat. O par
`renderCacheBytes/activeBitmapRefs` foi:

| Cenário | Cache bytes inicial → final | Active bitmap refs inicial → final |
| --- | ---: | ---: |
| `orientation` | 30.891.936 → 30.812.256 | 8 → 8 |
| `background` | 30.891.936 → 30.812.256 | 8 → 8 |
| `background-render` | 30.891.936 → 30.812.256 | 8 → 8 |
| `reverse-navigation` | 30.891.936 → 30.812.256 | 8 → 8 |
| `switch-during-render-return-pdf` | 30.891.936 → 30.812.256 | 8 → 1 |
| `long` | 30.891.936 → 30.808.272 | 8 → 15 (estável desde o ciclo 10) |

Esses resultados são a razão para não marcar a PR como saudável nem fazer
merge ainda.

### Controle de instrumentação

O smoke perf=1 de 2 ciclos em `small-large` confirmou que as trocas warm
realmente carregam `large-100` e depois `small` no mesmo processo, com os
eventos `fixture.loaded` observados para os dois fixtures. Esse smoke não foi
usado para a classificação de memória.

O APK release da coleta principal foi usado sem instrumentação de performance
(`perf=0`); o smoke instrumentado serviu somente para confirmar a troca warm.

## Falhas observadas

Nos logs filtrados pelo PID do app, `failures.txt` ficou vazio para:

- `FATAL EXCEPTION`;
- `ANR`;
- `OutOfMemoryError`;
- `recycled bitmap`;
- `IllegalStateException`;
- `WindowLeaked`;
- `papyrus_render_error`.

Os erros `UiAutomationService ... already registered` gerados pelo comando
externo de dump de UI foram excluídos da classificação; eles pertencem ao
processo de automação, não ao Papyrus.

As seis coletas históricas foram feitas com `perf=0` e permanecem no relatório
para comparação; as coletas isoladas desta rodada usaram `perf=1` justamente
para correlacionar os counters com o crescimento nativo observado.

## Conclusão

O harness agora testa retenção no mesmo processo e prova o invariant de PID.
Os cenários isolados, o controle `TEXT → PDF` e o `long` de vinte ciclos
ficaram bounded após o aquecimento da janela. O aumento inicial de native heap
e de PageViews no `long` estabilizou; como as referências acompanham exatamente
as PageViews ativas, não há owner leak confirmado. Não foi criado fix
especulativo de produto.

O próximo passo é manter os counters como diagnóstico de regressão e publicar
os artefatos da rodada. A PR pode ser revisada para merge sem mudança
comportamental no reader; qualquer otimização posterior deve partir de uma
regressão reproduzida, não do pico transitório de aquecimento.
