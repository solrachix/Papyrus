# Papyrus PR 15 — Fixture Harness e Instrumentação do Pinch

## Contexto

As medições Android da PR 14 mostraram que mover o preview do pinch para
Reanimated/UI thread não produziu melhora no fluxo real. A próxima rodada deve
identificar o custo dominante antes de propor outra otimização.

O exemplo Expo hoje carrega um PDF fixo. A instrumentação existente registra
eventos de pinch e renderização, mas não correlaciona uma sessão completa com o
commit documental, a geração de render e o momento em que o preview é removido.
Também não há fixtures móveis selecionáveis para comparar documentos pequenos,
grandes e com dimensões variadas.

## Objetivo

Criar uma infraestrutura opt-in e reproduzível para:

1. selecionar uma fixture por deep link, controlável por ADB;
2. registrar a identidade da fixture carregada;
3. correlacionar cada sessão de pinch com commit, render e preview;
4. separar no relatório a duração do gesto, do commit e do render-to-ready;
5. manter a coleta fora do caminho normal quando a instrumentação estiver
   desativada.

## Fora de escopo

- nenhuma alteração no algoritmo de pinch, transform, focal point, pan ou
  estratégia de renderização;
- nenhuma adoção ou remoção de Reanimated;
- nenhuma otimização baseada nos resultados desta rodada;
- nenhum seletor visual dentro do Viewer ou da tela do exemplo;
- nenhuma alegação de melhora de FPS sem uma rodada posterior de medição.

## Abordagem escolhida

### Seleção de fixture

O App resolverá `fixture` a partir da URL inicial recebida por
`Linking.getInitialURL()`. O contrato aceita somente o esquema
`exp+papyrus-sdk`, o caminho `/reader` e os parâmetros opcionais `fixture`,
`runId`, `sampleId`, `perf=1` e `viewerMode=compat`. O valor de `fixture` será validado por uma
allowlist. Sem parâmetro, a fixture padrão será usada; valor inválido usará a
mesma fixture padrão, mas emitirá `fixture.invalid` com o valor solicitado. O
relatório sempre distinguirá `requestedFixture` de `resolvedFixture`.

Os nomes públicos serão:

- `small` — PDF mínimo para smoke test;
- `large-100` — PDF determinístico com 100 páginas;
- `large-1000` — PDF determinístico com 1000 páginas;
- `varied-sizes` — PDF determinístico com páginas de dimensões diferentes.

Cada artefato terá um registro versionado em
`examples/mobile-expo/assets/fixtures/fixture-manifest.json`, contendo `name`,
`assetPath`, `byteLength`, `pageCount` e `sha256`. `large-100` e `large-1000`
serão gerados pelo script existente com conteúdo determinístico; `varied-sizes`
usará uma sequência fixa de dimensões `(612,792), (792,612), (360,540),
(1000,500)`. O gerador deverá verificar o manifesto após gerar os arquivos.
Os PDFs serão empacotados no exemplo para permitir execução offline; não haverá
URL local ou remota como fallback de benchmark. O limite será 20 MiB para o
conjunto descomprimido de fixtures e 30 MiB para o APK release. Acima disso o
check falhará, sem trocar silenciosamente para rede.

A resolução será uma função pura, separada da inicialização do engine, para ser
testada sem React Native. Cada entrada apontará para um asset estático dentro de
`examples/mobile-expo/assets/fixtures/`; o Viewer continuará recebendo somente o
engine.

Exemplo de execução:

```bash
adb shell am force-stop com.papyrus.sdk.mobileexpo
adb shell am start -W -a android.intent.action.VIEW \
  -d 'exp+papyrus-sdk://reader?fixture=large-1000' \
  com.papyrus.sdk.mobileexpo
```

O marcador de carregamento da fixture será emitido antes de `engine.load`, e a
medição de interação só será considerada válida depois de `fixture.loaded`, que
carregará `resolvedFixture`, `sha256`, `byteLength` e `pageCount`. O benchmark
falhará se o evento não existir ou divergir do manifesto.

Esta PR suporta seleção por deep link no cold start. Como a Activity é
`singleTask`, URLs recebidas enquanto o exemplo já está aberto serão observadas
por `Linking.addEventListener('url', ...)`, registradas como
`fixture.url_ignored` e não trocarão o documento ativo. O procedimento
reprodutível sempre executará `force-stop` antes de abrir uma nova fixture.

### Instrumentação correlacionada

Cada execução receberá um `runId` e cada amostra um `sampleId`. O app criará um
`documentLoadId` por carregamento e um `gestureId` por pinch, todos únicos dentro
do processo. Cada render terá um `renderRequestId` global no processo e o
`surfaceId` da superfície alvo. Os eventos compartilharão timestamp monotônico,
`runId`, `sampleId`, `documentLoadId`, `fixture`, `gestureId` quando aplicável e
os IDs próprios abaixo:

```text
fixture.requested
fixture.loaded
fixture.invalid
fixture.url_ignored
viewer.mode          (mode: compat|native)
pinch.start          (gestureId)
pinch.update         (gestureId; amostrado; não gerar log por frame)
pinch.end            (gestureId)
pinch.commit.start   (gestureId)
pinch.commit.end     (gestureId)
render.request       (renderRequestId, surfaceId, pageIndex, zoom, generation, gestureId)
render.ready         (renderRequestId, surfaceId, pageIndex, zoom, generation, gestureId)
render.stale         (renderRequestId, surfaceId, pageIndex, generation, gestureId, reason)
render.abandoned     (renderRequestId, surfaceId, pageIndex, generation, gestureId, reason)
render.error         (renderRequestId, surfaceId, pageIndex, generation, gestureId, reason)
pinch.preview.cleared (gestureId)
sample.start         (sampleId)
sample.end           (sampleId)
pinch.cancelled      (gestureId, reason)
```

O `PageRenderer` manterá a semântica atual de geração/stale. Cada
`render.request` terá exatamente um estado terminal: `ready`, `stale`,
`abandoned`, `error` ou `cancelled`. `stale` significa que a geração perdeu
validade; `abandoned` significa cleanup/unmount antes de um terminal, com motivo
`unmount`, `superseded`, `timeout` ou `request-rejected`; `error` representa
rejeição do render; `cancelled` só será emitido quando o engine confirmar que
`RenderTask.cancel()` foi chamado. Assim, o relatório não confundirá cleanup
com cancelamento nativo. Um pinch sem commit terá `pinch.cancelled` com motivo
`gesture-cancelled`, `orphaned` ou `invalid` e não entrará nos agregados de
commit-to-ready.

Esta PR mede o caminho `Viewer`/modo `compat`, no qual o pinch nasce no
callback JS e os renders passam pelo `PageRenderer`. O modo nativo dedicado,
que usa `ScaleGestureDetector` diretamente em
`PapyrusPdfViewerView.java`, fica explicitamente fora deste contrato e será
identificado no relatório como `viewerMode=native` se for detectado. Não haverá
tentativa de associar um `gestureId` JS a um gesto iniciado em Java nesta PR;
esse caminho exigirá uma investigação própria.

O evento `pinch.preview.cleared` será emitido somente quando o handshake aceitar
na página âncora e no zoom comprometido. Sessões órfãs serão fechadas antes de
uma nova sessão, emitindo `pinch.cancelled` e preservando a regra já usada pelo
benchmark. O `gestureId` nasce no callback JS `beginViewerPinch`; ele é mantido
em refs/contexto do Viewer e copiado para o `render.request` iniciado pelo
commit. Não haverá um segundo ID criado no Android nativo. Cada evento de
render incluirá `surfaceId`, derivado da chave estável do PageRenderer, para
distinguir superfícies concorrentes.

Quando `perf=1` não estiver presente, o recorder não instalará listeners,
timers ou coleta de eventos e não emitirá logs estruturados. Um teste de
regressão verificará esse caminho desativado.

O evento `viewer.mode` será emitido uma vez após o Viewer resolver o modo e
conterá os campos comuns (`timestamp`, `runId`, `sampleId`, `documentLoadId` e
`fixture`) mais `mode: compat|native`. O benchmark só aceitará
`viewerMode=compat` e falhará se receber `native` ou se o evento não aparecer;
o caminho nativo com `ScaleGestureDetector` permanece fora desta PR.

### Coleta Android

O arquivo `scripts/benchmarks/android-pinch-profile.sh` receberá:

```text
--fixture <name> --runs <n> --package <id> --device <serial>
```

O padrão será `--runs 5` por direção; o script exigirá exatamente um dispositivo
conectado, gerará `runId`/`sampleId`, fará `force-stop`, abrirá
`exp+papyrus-sdk://reader?fixture=<name>&runId=<runId>&sampleId=<sampleId>&perf=1&viewerMode=compat`
e aguardará `fixture.loaded` antes do warm-up. Cada `sampleId` representa um
único pinch no centro da viewport. O script executará cinco amostras de
pinch-out e cinco de pinch-in, reiniciando o app e o zoom inicial antes de cada
amostra. Cada gesto usará dois ponteiros ADB (`motionevent` API 35: `DOWN`,
`POINTER_DOWN`, movimentos interpolados, `POINTER_UP`, `UP`), duração de 1200 ms
e distância radial de 120 dp. O script validará, para o mesmo `sampleId`,
`viewer.mode=compat`, exatamente um `pinch.start`, um `pinch.end`, um par
`pinch.commit.start`/`pinch.commit.end`, pelo menos um `render.request` com
`gestureId`, um `render.ready` terminal correspondente e um
`pinch.preview.cleared`. Qualquer ausência, duplicação do commit ou divergência
de IDs marcará a amostra como incompleta.

Antes de cada amostra, executará `dumpsys gfxinfo <package> reset`, emitirá
`sample.start` imediatamente depois do reset e iniciará o gesto. Depois do
`pinch.preview.cleared`, emitirá `sample.end` imediatamente antes da coleta de
`dumpsys gfxinfo <package>` e do NDJSON dos eventos com os mesmos
`runId`/`sampleId`; só então encerrará a amostra. A janela de frames começa no
marcador `sample.start` e termina no `sample.end`, e o
relatório não incluirá o warm-up, abertura do documento ou o tempo entre
amostras. O arquivo JSON manterá as amostras individuais, eventos brutos e
agregados P50/P90/P95.

`--fixture` aceitará um nome, uma lista separada por vírgulas ou `all`; com
`--fixture all --runs 5`, cada uma das quatro fixtures terá cinco amostras
independentes. O protocolo de ponteiros será implementado pelo próprio script
com `adb shell input motionevent` na API 35 e validado pelo evento
`pinch.start`; uma sequência que não for reconhecida pelo app será inválida,
nunca um sucesso silencioso.

O relatório deverá preservar amostras individuais e agregados. Cada amostra
conterá, quando disponível:

- fixture solicitada e resolvida, hash, tamanho e page count;
- dispositivo/API, build/commit e parâmetros do gesto;
- `runId`, `sampleId`, `documentLoadId` e `gestureId`;
- duração do gesto e FPS da janela;
- duração do commit;
- duração de render request até render-ready;
- vida útil do preview;
- frames, janky frames, percentis de frame e missed vsync;
- renders ativos, stale e abandonados.

Se uma etapa não produzir evento de fechamento, se os IDs não casarem ou se a
fixture carregada divergir do manifesto, a amostra será marcada como
incompleta e excluída dos percentis, nunca convertida em latência zero.

## Testes

- teste unitário do resolvedor: valores válidos, ausente e inválido;
- teste do parser de deep link sem depender de `Linking` real;
- teste de correlação: uma sessão gera um único commit e associa somente seus
  próprios eventos;
- teste de sessão órfã: iniciar novo pinch fecha a sessão anterior;
- teste de render stale: não conta como `render.ready` nem como cancelamento
  confirmado;
- teste do benchmark: fixture informada aparece no deep link, a fixture
  resolvida vem de `fixture.loaded` e o manifesto é verificado por hash;
- teste do parser do protocolo de gesto: a sequência de ponteiros gera uma
  sessão delimitada, e falha se não houver `pinch.start`/`preview.cleared`;
- teste do agregador: calcula FPS, jank e percentis por amostra, excluindo
  amostras incompletas;
- teste do recorder desativado: sem `perf=1`, não instala listeners/timers nem
  emite eventos estruturados;
- suíte existente do pacote e teste de bundle/Android quando o ambiente estiver
  disponível.

## Critério de aceitação

A PR será considerada concluída quando o comando abaixo funcionar em um APK
release no `Pixel7Clean`/API 35, com o mesmo commit e manifesto registrados:

```bash
bash scripts/benchmarks/android-pinch-profile.sh \
  --fixture small,large-100,large-1000,varied-sizes --runs 5 \
  --package com.papyrus.sdk.mobileexpo --device Pixel7Clean
```

Ele deverá executar sem rede e produzir um JSON/NDJSON versionável ou
explicitamente anexável, com pelo menos quatro amostras válidas por fixture
para as quatro fixtures. O check do APK verificará que os quatro assets e o
manifesto estão presentes no artefato release e falhará se o limite de tamanho
for excedido.

O relatório deverá distinguir numericamente:

```text
gesto → commit → render request → render-ready → preview cleared
```

O resultado desta PR é observabilidade reproduzível. A escolha da otimização
seguinte será feita somente após os números e a validação visual do fluxo.
