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
`exp+papyrus-sdk`, o caminho `/reader` e um único parâmetro `fixture`. O valor
será validado por uma allowlist. Sem parâmetro, a fixture padrão será usada;
valor inválido usará a mesma fixture padrão, mas emitirá `fixture.invalid` com
o valor solicitado. O relatório sempre distinguirá `requestedFixture` de
`resolvedFixture`.

Os nomes públicos serão:

- `small` — PDF mínimo para smoke test;
- `large-100` — PDF determinístico com 100 páginas;
- `large-1000` — PDF determinístico com 1000 páginas;
- `varied-sizes` — PDF determinístico com páginas de dimensões diferentes.

Cada artefato terá um registro versionado em um manifesto contendo `name`,
`assetPath`, `byteLength`, `pageCount` e `sha256`. `large-100` e `large-1000`
serão gerados pelo script existente com conteúdo determinístico; `varied-sizes`
usará uma sequência fixa de dimensões `(612,792), (792,612), (360,540),
(1000,500)`. O gerador deverá verificar o manifesto após gerar os arquivos.
Os PDFs serão empacotados no exemplo para permitir execução offline. O limite
de aceitação será 20 MiB para o conjunto descomprimido de fixtures e 30 MiB
para o APK release; acima disso a PR falhará o check de fixture e não esconderá
o problema usando URL remota.

A resolução será uma função pura, separada da inicialização do engine, para ser
testada sem React Native. As fontes serão referências estáticas empacotáveis ou
URLs locais de fixture definidas pelo exemplo; o Viewer continuará recebendo
somente o engine.

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
pinch.start          (gestureId)
pinch.update         (gestureId; amostrado; não gerar log por frame)
pinch.end            (gestureId)
pinch.commit.start   (gestureId)
pinch.commit.end     (gestureId)
render.request       (renderRequestId, pageIndex, zoom, generation, gestureId)
render.ready         (renderRequestId, pageIndex, zoom, generation, gestureId)
render.stale         (renderRequestId, pageIndex, generation, gestureId, reason)
render.abandoned     (renderRequestId, pageIndex, generation, gestureId, reason)
render.error         (renderRequestId, pageIndex, generation, gestureId, reason)
pinch.preview.cleared (gestureId)
```

O `PageRenderer` manterá a semântica atual de geração/stale. Cada
`render.request` terá exatamente um estado terminal: `ready`, `stale`,
`abandoned` ou `error`. `stale` significa que a geração perdeu validade;
`abandoned` significa cleanup/unmount antes de um terminal, com motivo
`unmount`, `superseded` ou `timeout`; `error` representa rejeição do render.
Nenhum desses eventos afirmará cancelamento nativo: `render.cancel` só poderá
ser emitido quando o engine confirmar que `RenderTask.cancel()` foi chamado.
Pedidos ignorados antes de iniciar serão registrados como `render.abandoned`
com motivo `request-rejected`.

O evento `pinch.preview.cleared` será emitido somente quando o handshake aceitar
na página âncora e no zoom comprometido. Sessões órfãs serão fechadas antes de
uma nova sessão, preservando a regra já usada pelo benchmark.

### Coleta Android

O arquivo `scripts/benchmarks/android-pinch-profile.sh` receberá:

```text
--fixture <name> --runs <n> --package <id> --device <serial>
```

O padrão será `--runs 5`; o script exigirá exatamente um dispositivo conectado,
gerará `runId`/`sampleId`, fará `force-stop`, abrirá
`exp+papyrus-sdk://reader?fixture=<name>&runId=<runId>&sampleId=<sampleId>` e
aguardará `fixture.loaded` antes do warm-up. A sessão válida terá três
repetições de pinch-out e pinch-in no centro da viewport, com dois ponteiros
ADB (`motionevent` API 35: `DOWN`, `POINTER_DOWN`, movimentos interpolados,
`POINTER_UP`, `UP`), duração de 1200 ms e distância radial de 120 dp. O script
validará a presença de `pinch.start` e `pinch.preview.cleared` para o mesmo
`sampleId`; caso contrário, marcará a amostra incompleta.

Antes de cada amostra, executará `dumpsys gfxinfo <package> reset`; depois do
`pinch.preview.cleared`, coletará `dumpsys gfxinfo <package>` e o NDJSON dos
eventos com os mesmos `runId`/`sampleId`. A janela de frames começa no marcador
`sample.start` e termina no `sample.end`, e o relatório não incluirá o warm-up,
abertura do documento ou o tempo entre amostras. O arquivo JSON manterá as
amostras individuais, eventos brutos e agregados P50/P90/P95.

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
- suíte existente do pacote e teste de bundle/Android quando o ambiente estiver
  disponível.

## Critério de aceitação

A PR será considerada concluída quando o comando abaixo funcionar em um APK
release no `Pixel7Clean`/API 35, com o mesmo commit e manifesto registrados:

```bash
bash scripts/benchmarks/android-pinch-profile.sh \
  --fixture large-1000 --runs 5 \
  --package com.papyrus.sdk.mobileexpo --device Pixel7Clean
```

Ele deverá executar sem rede e produzir um JSON/NDJSON versionável ou
explicitamente anexável, com pelo menos quatro amostras válidas, para `small`,
`large-100` e `large-1000`. A fixture `varied-sizes` terá o mesmo contrato e
será executada quando seu tamanho ficar dentro dos limites do manifesto.

O relatório deverá distinguir numericamente:

```text
gesto → commit → render request → render-ready → preview cleared
```

O resultado desta PR é observabilidade reproduzível. A escolha da otimização
seguinte será feita somente após os números e a validação visual do fluxo.
