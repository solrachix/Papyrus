# PR28 — stress de memória e lifecycle no Android

## Escopo

Esta rodada cobre somente o example Android em `viewerMode=compat`, com PDF,
TXT e EPUB, troca de documentos, background/foreground, rotação e reabertura.
Não houve alteração de renderização, pinch, overscan, scheduler ou viewer
nativo.

## Ambiente

- base: `main` em `c6d7ddcae271f3818ba984ee2c4799259889744b`;
- dispositivo exclusivo: `emulator-5554`, Pixel 7/API 35, `x86_64`;
- package: `com.papyrus.sdk.mobileexpo`;
- viewer: Android `compat`;
- APK release usado: artefato da mesma base PR27,
  SHA-256 `aa44ba1a9109d1f948e412d8284b69e18926373ab9be440d875e13c34a9c2d7e`;
- o dispositivo físico `6fe88ef10000` não foi usado.

O APK da base foi usado porque o rebuild do example nesta worktree continua
dependendo do ambiente Expo/RN existente. A tentativa de `pnpm build` também
encontrou uma falha preexistente de declaração em `packages/engine-rust`; os
scripts e o exemplo executado não foram alterados por essa falha.

## Protocolo

O runner coleta checkpoints nos ciclos `0/1/5/10/20`, sem `System.gc()`, sem
limpeza manual de cache e sem intervenção artificial no produto. Cada
checkpoint salva `dumpsys meminfo`, `dumpsys gfxinfo`, PID, hierarquia de UI e
logcat. A classificação pós-aquecimento só marca suspeita quando há ao menos
três pontos e crescimento forte de memória associado a crescimento de
recursos.

O `perf=0` foi usado no stress principal. Um controle curto `perf=1` foi
executado no `large-1000` com três ciclos para manter a instrumentação
diagnóstica coberta sem misturar seus eventos na leitura principal.

## Resultados

Valores em KB; `PSS` e heaps são `inicial → pico → final`. `views` conta
identificadores `papyrus-page-*` na hierarquia no checkpoint.

| Cenário | Ciclos | PSS | Native | Java | Views | Classificação |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `reopen-small` | 20 | 91.702 → 91.702 → 89.685 | 25.968 → 26.040 → 26.040 | 11.592 → 11.616 → 11.616 | 1 → 1 → 1 | `HEALTHY` |
| `small-large` | 20 | 91.380 → 130.344 → 130.084 | 25.720 → 62.608 → 62.360 | 11.524 → 12.604 → 12.584 | 1 → 3 → 3 | `HEALTHY` |
| `large-reopen` | 10 | 130.055 → 144.440 → 142.647 | 64.124 → 73.376 → 73.292 | 12.508 → 14.336 → 14.336 | 3 → 3 → 3 | `HEALTHY` |
| `cross-format` | 10 | 89.706 → 89.706 → 87.924 | 25.872 → 25.872 → 22.744 | 11.552 → 11.552 → 6.604 | 1 → 1 → 1 | `HEALTHY` |
| `background` | 20 | 89.776 → 92.009 → 92.009 | 25.872 → 25.872 → 25.220 | 11.524 → 11.524 → 7.708 | 1 → 1 → 1 | `HEALTHY` |
| `switch-during-render` | 10 | 131.875 → 190.060 → 189.534 | 64.408 → 65.236 → 65.072 | 12.504 → 34.148 → 34.116 | 3 → 3 → 0 | `HEALTHY`* |
| `reverse-navigation` | 10 | 132.650 → 132.650 → 131.954 | 64.564 → 64.564 → 64.152 | 12.576 → 12.608 → 12.608 | 3 → 3 → 3 | `HEALTHY` |
| `long` | 10 | 128.319 → 132.923 → 130.739 | 62.376 → 67.092 → 67.092 | 12.608 → 12.608 → 6.292 | 3 → 3 → 3 | `HEALTHY` |
| `background-render` | 5 | 132.435 → 132.435 → 126.273 | 64.188 → 64.188 → 61.660 | 12.568 → 12.568 → 12.248 | 3 → 3 → 3 | `INCONCLUSIVE`** |
| `orientation` | 4 | 89.522 → 108.581 → 108.581 | 25.868 → 41.628 → 41.628 | 11.592 → 11.592 → 8.228 | 1 → 1 → 1 | `INCONCLUSIVE`** |

\* No `switch-during-render` final page is expected after the scenario switches
to TXT; the PDF surface count going to zero is a format transition, not a
resource leak. PSS/native/Java remained bounded and no failure signature was
found.

\* `INCONCLUSIVE` means the runner intentionally had only checkpoints `0/1/5`
for these shorter scenarios, leaving fewer than three post-warm-up points. It
does not mean that a leak was detected.

### Controle de instrumentação

`large-reopen`, `perf=1`, 3 ciclos:

- PSS: `130.248 → 144.333 → 143.356 KB`;
- native heap: `64.272 → 73.376 → 73.376 KB`;
- Java heap: `12.572 → 14.408 → 14.384 KB`;
- views: `3 → 3 → 3`;
- classificação: `INCONCLUSIVE` por amostra curta;
- nenhum padrão fatal no logcat.

O controle confirma que o caminho instrumentado executa no emulador, mas não
é uma medição A/B de jank; PR28 não usa esse controle para concluir sobre
performance.

## Falhas observadas

Em todos os diretórios finais, `failures.txt` ficou vazio para:

- `FATAL EXCEPTION`;
- `ANR`;
- `OutOfMemoryError`;
- `recycled bitmap`;
- `IllegalStateException`;
- `WindowLeaked`;
- `papyrus_render_error`.

Não foram coletados contadores confiáveis de engines, renders ativos, cache ou
requests de bridge nesta rodada; esses campos permanecem fora da conclusão em
vez de serem inferidos a partir de PSS.

## Conclusão

Nos cenários executados não apareceu crescimento pós-aquecimento compatível com
leak de memória ou lifecycle. Os picos ao entrar em `large-100`/`large-1000`
são esperados e permaneceram estáveis nas reaberturas subsequentes. Não há
evidência nesta rodada para criar uma correção de produto.

O próximo passo, se necessário, é instrumentar contadores explícitos de
engine/render/cache/bridge e repetir somente os cenários que mostrarem
crescimento, mantendo a política de não aplicar cleanup especulativo.
