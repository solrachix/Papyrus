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

## Resultados

Valores em KB; `PSS` e heaps são `inicial → pico → final`. `views` conta
identificadores `papyrus-page-*` na hierarquia no checkpoint. Cada sequência de
PID permaneceu constante durante o cenário.

| Cenário | Ciclos | PSS | Native | Java | Views | Classificação |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `reopen-small` | 20 | 88.840 → 130.784 → 130.784 | 25.868 → 59.036 → 59.036 | 11.544 → 11.544 → 8.016 | 1 → 1 → 1 | `HEALTHY` (PID 18540) |
| `small-large` | 20 | 89.357 → 152.061 → 142.707 | 25.832 → 63.608 → 59.168 | 11.604 → 11.604 → 10.984 | 1 → 1 → 1 | `HEALTHY` (PID 19294) |
| `large-reopen` | 10 | 132.047 → 151.719 → 150.722 | 64.476 → 69.136 → 63.804 | 12.492 → 12.492 → 7.860 | 3 → 3 → 3 | `HEALTHY` (PID 20539) |
| `switch-during-render` | 10 | 131.855 → 204.784 → 204.784 | 64.508 → 64.508 → 61.184 | 12.504 → 25.156 → 25.156 | 3 → 0 → 0 | `MIXED` (PID 21150) |
| `long` | 10 | 130.219 → 195.803 → 195.803 | 62.680 → 107.300 → 107.300 | 12.492 → 12.492 → 9.752 | 3 → 3 → 3 | `NATIVE_HEAP` (PID 21748) |
| `cross-format` | 10 | 89.241 → 89.241 → 87.784 | 25.776 → 25.776 → 22.556 | 11.544 → 11.544 → 6.604 | 1 → 1 → 1 | `HEALTHY` (PID 22805) |

`reopen-small`, `small-large` e `large-reopen` mantiveram o processo e as
quantidades de views estáveis. `cross-format` também permaneceu no mesmo PID e
sem crescimento de recursos observável.

Dois cenários não podem ser declarados saudáveis ainda:

- `switch-during-render` terminou com uma WebView e heap Java maior, por isso o
  agregador classificou como `MIXED`; a troca de formato parece ter sido
  concluída, mas o custo de steady state precisa ser separado de retenção;
- `long` apresentou crescimento nativo de `62.680 → 107.300 KB` ao longo de
  dez ciclos, resultando em `NATIVE_HEAP`. Esse é o principal achado pendente e
  requer uma rodada específica para separar cache/steady state de leak real.

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

Não foram coletados contadores confiáveis de engines, renders ativos, cache ou
requests de bridge nesta rodada; esses campos permanecem fora da conclusão em
vez de serem inferidos a partir de PSS.

## Conclusão

O harness agora testa retenção no mesmo processo e prova o invariant de PID.
Três cenários e o controle cross-format ficaram bounded, mas `long` e
`switch-during-render` ainda precisam de investigação antes do merge. Não foi
criado fix especulativo de produto.

O próximo passo é instrumentar ou isolar o cache/lifecycle das trocas de
formato e repetir somente `long` e `switch-during-render`, mantendo um único
PID e sem voltar a usar `force-stop` entre ciclos.
