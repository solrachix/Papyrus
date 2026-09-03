# Papyrus — validação final do reader Android

## Escopo e ambiente

Esta é a consolidação das rodadas PR20–PR28 após o merge da PR28 na `main`
(`84980749d8379d56f6fc1a3204db29ab284a553b`). A validação Android foi feita
somente no `emulator-5554`, Pixel 7 API 35 (`x86_64`), usando
`com.papyrus.sdk.mobileexpo` em `viewerMode=compat`. O dispositivo físico
`6fe88ef10000`/POCO não foi usado.

## Resultado por rodada

| Rodada | Resultado |
| --- | --- |
| PR20 — EPUB reverse-scroll/instrumentação | ✅ loading, geração e diagnóstico de scroll preservados; sem fix especulativo de fila publicado |
| PR21 — pinch/render-ready | ✅ handshake causal, commit único e preview até `render.ready` |
| PR22 — distant jump/clipping | ✅ `large-1000` no compat; salto distante sem página branca real; clipping seguro por plataforma |
| PR23 — rotação Android | ✅ bitmap limitado, ownership/lifecycle protegido e restore sem timer arbitrário |
| PR24 — TXT/WebView lifecycle | ✅ TXT visível, erro terminal e troca de formatos sem spinner preso |
| PR25 — large PDF scroll/jank | ✅ baseline reproduzível; virtualização bounded; sem tuning especulativo |
| PR26 — native raster/draw profiling | ✅ raster, lock, install e draw separados; nenhum dominante isolado |
| PR27 — UI-thread investigation | ✅ slices customizados do app presentes; atribuição causal permanece inconclusiva |
| PR28 — memory/lifecycle stress | ✅ 20 ciclos warm no mesmo PID; memória/counters estabilizam |

## Gates de código

Executados na árvore da `main` mergeada:

- `@papyrus-sdk/engine-native build`: passou;
- `@papyrus-sdk/ui-react-native build`: passou;
- testes focados JS/Node e agregador de lifecycle: **10/10** passando;
- `:papyrus-sdk_engine-native:testDebugUnitTest`: **14/14** passando;
- `git status`: árvore limpa antes da inclusão deste relatório.

O APK release usado no smoke foi o artefato da árvore da PR28, cujo conteúdo é
exatamente o commit que entrou na `main`; instalação no emulador terminou com
`Success`.

O rebuild release limpo a partir de uma instalação nova na `main` encontrou um
problema de infraestrutura do exemplo: Expo SDK 52 com `node-linker=isolated`
gera uma importação incorreta (`expo.core.ExpoModulesPackage`) durante o
autolinking. O pacote `expo-asset` também não fica visível sem o link local do
importer. Isso não alterou arquivos versionados nem o código do reader; o APK
equivalente já compilado foi usado para não confundir essa limitação do
harness com uma falha funcional.

## Smoke Android final

### PDF pequeno e grande

- `reopen-small`: PDF de uma página abriu e permaneceu renderizado; PID
  `7635`, uma view anexada, sem erro fatal.
- `large-reopen` com `large-1000`: carregamento reportou `pageCount=1000`,
  scroll e warm reopen concluíram; views permaneceram limitadas e o cache
  ficou em seis entradas.

### Pinch

O injector multipointer do console do emulador produziu sessões reais nos dois
sentidos. Em cada sessão observada:

```text
pinch.start
→ pinch.update
→ pinch.end
→ pinch.commit.start
→ render.request
→ render.ready
→ pinch.preview.cleared
→ sample.end (complete)
```

Não houve rasterização por update: o gesto teve um commit final e a superfície
foi liberada após `render.ready`. Na amostra small, o `gfxinfo` registrou 33–34
frames, 54,55–55,88% de jank, P90 de 48–61 ms e P95 de 85–400 ms; esses números
são smoke do emulador/protocolo ADB, não uma nova reivindicação de melhoria.

### Distant jump

Na `large-1000`, o salto manual `4 → 999` foi concluído. A hierarquia terminou
com `papyrus-page-999` e `papyrus-page-1000`, e a captura final mostrou o texto
da página 1000. Não houve `scrollToIndexFailed`, página branca real, crash ou
ANR; o espaço branco entre páginas é o fundo legítimo do fixture sintético.

### Rotação e lifecycle

O runner executou portrait → landscape → portrait em `large-1000`, mantendo
`engineStates=1`, `loadedDocuments=1`, views e cache bounded. Não apareceram
`recycled bitmap`, `FATAL EXCEPTION`, `OutOfMemoryError`, `ANR` ou
`papyrus_render_error` nos logs filtrados do app.

### TXT, EPUB e troca de formatos

- TXT foi aberto pela interface e exibiu o conteúdo do WebView;
- EPUB foi aberto pela interface e exibiu “Papyrus EPUB” e seu texto;
- PDF → TXT → EPUB foi exercitado no mesmo processo;
- o caminho final volta a permitir PDF por novo deep link sem erro de engine.

### Background/foreground

O cenário `background` enviou o app para home e o reabriu no mesmo emulador.
O documento voltou a ficar disponível; `engineStates=1`, `loadedDocuments=1`,
`activeRenderRequests=0` e `renderCacheEntries=6` no checkpoint final.

## Conclusões técnicas

As rodadas e o smoke final sustentam estas conclusões:

- rasterização Pdfium não é o gargalo dominante medido;
- lock, instalação de bitmap e `Canvas.drawBitmap()` não explicam sozinhos a
  latência total;
- a virtualização permanece limitada ao tamanho da janela, inclusive em
  `large-1000`;
- ownership e descarte de bitmaps não apresentaram retenção crescente;
- no stress PR28, `activePageViews`/`activeBitmapRefs` subiram de 8 para 15
  durante o aquecimento e estabilizaram a partir do ciclo 10; cache ficou em
  até seis entradas;
- não foi reproduzido leak, crash, ANR ou OOM no stress final;
- o jank de scroll restante não tem owner causal suficientemente reproduzível
  para tuning seguro.

## Backlog

`Android PDF scroll performance — further investigation` permanece como
backlog. Retomar somente com reprodução determinística em aparelho real
representativo e profiler que identifique o owner do custo. Não alterar
`windowSize`, overscan, scheduler ou executor apenas a partir do percentual de
jank do emulador.

Limpezas técnicas independentes, sem bloquear o reader:

- separar testes Node `.mjs` da coleta Vitest;
- resolver as falhas preexistentes de `examples/web/App.phase1-shell.test.tsx`;
- auditar que toda telemetria de performance permanece opt-in;
- avaliar uma CLI única para os benchmarks Android.

## Status

O roadmap de investigação Android do reader está encerrado quanto a bugs e
owners reproduzíveis cobertos pelas PR20–PR28. O único item pendente é a
reprodutibilidade do rebuild release em uma instalação limpa do harness Expo
52/pnpm isolado; o artefato equivalente ao commit mergeado foi instalado e
validado no emulador.
