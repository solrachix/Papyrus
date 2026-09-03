# Papyrus engine benchmark

Este benchmark mede o caminho documental, não a UI completa. O fixture padrão é
um PDF sintético de 1000 páginas, criado localmente para evitar incorporar uma
obra de terceiros ao repositório.

```bash
node scripts/benchmarks/generate-large-pdf.mjs 1000 /tmp/papyrus-benchmark-1000.pdf
node scripts/benchmarks/measure-pdfjs.mjs /tmp/papyrus-benchmark-1000.pdf
cargo run --release --manifest-path crates/papyrus-core-rust/Cargo.toml \
  --bin benchmark -- /tmp/papyrus-benchmark-1000.pdf
```

O script PDF.js compara carregamento, extração de texto em páginas pontuais,
outline, operator list e busca em todas as páginas. O crate Rust compara
carregamento, extração pontual, primeira busca (construção lazy do índice) e
busca quente usando `lopdf`.

No fixture de 1000 páginas, a execução observada foi:

- PDF.js: busca em todas as páginas em 138,93 ms.
- Rust: abertura em 2,40 ms, primeira busca em 163,93 ms e busca quente em
  0,10 ms.

Portanto, o índice lazy preserva a abertura rápida e troca custo apenas na
primeira busca; consultas seguintes não reextraem o texto do PDF.

A medição de rasterização ainda requer um runtime com `canvas` ou browser
disponível. No ambiente desta execução, o `canvas` não compilou para o Node
ativo por falta de headers nativos.

## PR15: perfil Android do pinch

As fixtures móveis são locais, determinísticas e verificáveis por SHA-256:

```bash
pnpm fixtures:mobile:check
```

O exemplo aceita apenas o deep link `exp+papyrus-sdk://reader` e resolve
`small`, `large-100`, `large-1000` ou `varied-sizes` pelo registry estático.
URLs recebidas com o app já aberto são registradas como ignoradas; nenhum PDF
remoto é usado como fallback.

Depois de gerar um APK release, a matriz reproduzível é:

```bash
pnpm fixtures:mobile
rtk bash examples/mobile-expo/android/gradlew \
  -p examples/mobile-expo/android \
  -PreactNativeArchitectures=x86_64 \
  -Pexpo.gif.enabled=false \
  -Pexpo.webp.enabled=false \
  :app:assembleRelease
bash scripts/benchmarks/android-pinch-profile.sh \
  --fixture all --runs 5 --package com.papyrus.sdk.mobileexpo \
  --device emulator-5554 --output-dir /tmp/papyrus-pr15-android
node scripts/benchmarks/android-pinch-aggregate.mjs /tmp/papyrus-pr15-android \
  > /tmp/papyrus-pr15-android/report.json
```

O runner força um cold start por amostra, aquece a fixture, reseta o
`gfxinfo`, injeta um único pinch multipointer usando, nesta ordem, eventos do
console do Emulator, Protocol B descoberto dinamicamente ou o helper definido
em `PAPYRUS_MULTITOUCH_HELPER`. Se nenhum mecanismo real estiver disponível,
ele falha em vez de simular pinch com dois swipes. O agregador publica cada
amostra e os agregados P50/P90/P95 por fixture e direção; amostras sem a cadeia
causal completa ficam fora dos percentis. O runner chama o agregador ao final e
falha se algum grupo tiver menos de `runs - 1` amostras válidas (`1` quando há
apenas um run). A conversão de `--radius` parte de dp e usa a densidade do
dispositivo antes de enviar os eventos de toque.

O FPS é calculado com a janela real de `dumpsys gfxinfo reset → dump`, registrada
como `gfxWindowDurationMs`; a duração do gesto e a duração total da amostra são
mantidas como métricas separadas.

## PR25: perfil Android de scroll de PDF

O coletor de scroll é opt-in e exige um dispositivo explícito quando há mais de
um alvo ADB conectado. Ele espera o lote inicial de páginas antes de resetar o
`gfxinfo`, para não misturar abertura do documento com a janela de scroll:

```bash
bash scripts/benchmarks/android-scroll-profile.sh \
  --fixture all --runs 3 --package com.papyrus.sdk.mobileexpo \
  --device emulator-5554 --output-dir /tmp/papyrus-pr25-android-scroll
```

Cada amostra grava `events.ndjson`, `gfxinfo.txt`, `meminfo.txt`,
`metadata.txt` e uma captura de tela. O script não altera `windowSize`,
`maxToRenderPerBatch`, overscan ou o scheduler; ele serve para correlacionar
scroll, viewability, mounts e lifecycle de render com as métricas do Android.
Os resultados da rodada estão em
[`docs/performance/pr-25-large-pdf-scroll-jank.md`](../../docs/performance/pr-25-large-pdf-scroll-jank.md).

## PR26: fases nativas do render PDF

O perfil nativo é opt-in e somente diagnóstico. Ele usa o mesmo protocolo de
scroll da PR25 e, quando `perf=1`, grava em cada amostra:

- `events.ndjson`: eventos JS já existentes;
- `native-events.ndjson`: fila, worker, lock, raster Pdfium, cache, handoff
  para a UI, instalação, invalidação e primeiro draw;
- `native-render.json`: fases agregadas por `renderRequestId`.

Execute sempre com o emulador explícito:

```bash
bash scripts/benchmarks/android-scroll-profile.sh \
  --fixture large-1000 \
  --runs 1 \
  --perf 1 \
  --package com.papyrus.sdk.mobileexpo \
  --device emulator-5554 \
  --output-dir /tmp/papyrus-pr26-native-render
```

Para o controle de overhead, repita o mesmo protocolo com `--perf 0`. Nesse
modo não há marcadores nativos nem fallback silencioso de métricas; a execução
serve apenas para comparar o custo do profiler.

Para o emulador `Pixel_7_API_35`, o APK do benchmark deve ser construído com
`x86_64`. GIF/WebP são opcionais e ficam desativados nesse artefato para manter
o limite de 30 MiB; isso não altera a configuração padrão multi-ABI do app.

## PR27: contenção da UI thread com Perfetto

O harness abaixo inicia uma captura Perfetto de duração limitada por execução,
executa o mesmo protocolo de quatro swipes e copia um `.pftrace` separado para
cada run. Use sempre o emulador explicitamente:

```bash
bash scripts/benchmarks/android-ui-thread-trace.sh \
  --fixture large-1000 \
  --runs 3 \
  --package com.papyrus.sdk.mobileexpo \
  --device emulator-5554 \
  --output-dir /tmp/papyrus-pr27-large1000-trace
```

`--runs N` cria N sessões e, com tracing ligado, N arquivos Perfetto
independentes. `--trace 0` executa
somente o perfil, permitindo comparar o overhead do trace com o mesmo
protocolo. As seções `android.os.Trace` e os marcadores UIBlock
são emitidos apenas quando `perf=1`; o caminho normal permanece sem tracing.
Traces grandes ficam em `/tmp`, enquanto o relatório versiona somente os
resumos e timestamps relevantes.

## PR28: stress de memória e lifecycle no Android

O runner de lifecycle é diagnóstico e não executa `System.gc()`, limpa cache
manualmente nem altera o comportamento do viewer. Ele aceita somente o
`emulator-5554`, faz um único cold start por cenário e usa deep links warm para
as trocas seguintes. Assim, os ciclos de retenção permanecem no mesmo processo.
Ele coleta checkpoints de PSS/heap, views, activities, WebViews, PID e logcat
nos ciclos `0/1/5/10/20` (quando aplicável):

```bash
bash scripts/benchmarks/android-lifecycle-stress.sh \
  --device emulator-5554 \
  --scenario reopen-small \
  --cycles 20 \
  --package com.papyrus.sdk.mobileexpo \
  --output-dir /tmp/papyrus-pr28-reopen-small \
  --fixture small \
  --perf 0
```

Os cenários disponíveis são `reopen-small`, `small-large`, `large-reopen`,
`cross-format`, `background`, `background-render`, `switch-during-render`,
`switch-during-render-return-pdf`, `text-steady-state`, `reverse-navigation`,
`orientation` e `long`. Cada execução grava
`checkpoints.ndjson`, dumps brutos por checkpoint, `failures.txt` e
`aggregate.json`. O agregador aceita JSON array ou NDJSON, publica a
`pidSequence` e invalida a classificação `HEALTHY` quando algum checkpoint não
tem o mesmo PID inicial. Ele separa o aquecimento da tendência pós-aquecimento
e só classifica suspeita de leak quando há evidência suficiente de crescimento
de memória e/ou recursos. `force-stop` fica restrito ao cold start inicial;
execuções anteriores que reiniciavam o processo a cada ciclo não são evidência
de retenção.

Com `--perf 1`, cada checkpoint também captura o último snapshot opt-in de
ownership publicado pelo engine: engines/documentos, bytes/entradas do cache,
referências de bitmaps, PageViews ativas, bitmaps cacheados, renders ativos,
WebViews e requests pendentes do bridge. A ausência desses campos em `perf=0`
é intencional.

O protocolo completo e os resultados versionados ficam em
[`docs/performance/pr-28-android-memory-lifecycle-stress.md`](../../docs/performance/pr-28-android-memory-lifecycle-stress.md).

## Fixtures reproduzíveis da PR 13

O catálogo abaixo gera os seis cenários da rodada em um diretório temporário e
imprime um manifesto JSON com contagem de páginas, tamanho e SHA-256:

```bash
node scripts/benchmarks/perf-fixtures.mjs --output /tmp/papyrus-pr13-fixtures
```

Os perfis são `small-20`, `medium-200`, `large-1000`, `image-heavy`,
`varied-sizes` e `text-heavy`. Os PDFs são sintéticos e determinísticos: eles
exercitam o pipeline de parsing, text layer, rasterização e virtualização, mas
não representam a distribuição real de documentos dos usuários. O catálogo
valida a quantidade de páginas e o hash esperado antes de publicar o
manifesto; os arquivos gerados não entram no repositório.

## Política de zoom, janela e layout

Para reproduzir a política de renderização da rodada de performance:

```bash
pnpm bench:zoom
```

Esse comando usa os helpers reais de orçamento de canvas, overscan, janela
virtual e prefixos de layout. O cenário web considera duas superfícies por
página durante o double buffer. As durações e contagens são sintéticas e não
substituem uma medição de frames, memória ou cancelamento em browser/dispositivo
real; essas métricas aparecem explicitamente como indisponíveis no JSON.

## Protocolo de captura web da PR 13

O coletor web é desligado por padrão. Para habilitá-lo, abra o demo com
`?papyrusPerf=1` ou defina `window.__PAPYRUS_WEB_PERF__ = true` antes de montar
o `Viewer`. Após executar o cenário, exporte o snapshot no console:

```js
JSON.stringify(window.__PAPYRUS_WEB_PERF__.snapshot())
```

O script abaixo resume esse snapshot e deixa campos não suportados como
`null`. Sem `--input`, ele imprime um relatório `not-run`; isso é intencional e
não representa uma captura real:

```bash
node scripts/benchmarks/web-perf.mjs \
  --fixture large-1000 \
  --scenario "zoom 1→5→1" \
  --input /tmp/papyrus-web-snapshot.json \
  --output /tmp/papyrus-web-report.json \
  --markdown /tmp/papyrus-web-report.md
```

O protocolo mínimo por fixture é: abrir o documento, executar zoom `1→5→1`
por 20 ciclos, fazer scroll rápido, executar os jumps `1→500→999` e capturar
antes/depois. Para o cenário de 5000 páginas, conferir wrappers, Canvas e
PageRenderers montados, scroll ao meio/fim/começo e páginas de alturas
variadas. A contagem de frames é uma observação da thread JavaScript, não FPS
de hardware; a memória só aparece quando `performance.memory` existe.

## Medição no browser

O relatório versionado da validação Android da PR 13 está em
[`docs/performance/pr-13-real-world-validation.md`](../../docs/performance/pr-13-real-world-validation.md).

Com o demo web em `http://localhost:3005/`, o PDF de 1000 páginas foi carregado
pelo controle de upload local. Três execuções chegaram a 1007 canvases em
686–763 ms: 996 thumbnails, 7 páginas principais visíveis e 4 canvases
auxiliares. Isso mede o carregamento do documento e o primeiro lote de
renderização da UI virtualizada; não significa que as 1000 páginas principais
foram rasterizadas simultaneamente.

## PoC CBZ: zip.js vs Rust

Este PoC compara o backend atual `@zip.js/zip.js` com o núcleo Rust
`papyrus-cbz-rust` usando exatamente o mesmo arquivo CBZ.

```bash
node scripts/benchmarks/generate-cbz.mjs --pages 1000 --page-size 65536 --output /tmp/papyrus-benchmark.cbz
node scripts/benchmarks/benchmark-cbz.mjs /tmp/papyrus-benchmark.cbz --iterations 5
cargo run --release --manifest-path crates/papyrus-cbz-rust/Cargo.toml --bin benchmark-cbz -- /tmp/papyrus-benchmark.cbz --iterations 5
```

Os dois benchmarks imprimem JSON com SHA-256 do fixture, quantidade de páginas,
mediana das amostras e checksums dos bytes extraídos. O fixture usa bytes
sintéticos determinísticos com extensão `.jpg`; ele mede ZIP/CBZ, não
decodificação de imagem.

O PoC mede abertura/listagem, extração da primeira/meio/última página e
extração de todas as páginas. Ele não mede renderização DOM, `createImageBitmap`,
WASM no navegador, FFI mobile ou cache de URLs. O adaptador experimental já
está em `packages/engine-cbz-rust` e pode ser validado no demo com:

```bash
pnpm dev:web
# abra http://localhost:3005/render?engine=rust-cbz
```

Compare com `engine=cbz` para separar o custo do runtime Rust do restante do
viewer. Ainda não há um número de ganho de desempenho no navegador; a validação
atual prova o fluxo funcional e mantém `zip.js` como fallback. CBR/RAR continua
fora porque o backend atual usa `libarchive`; uma versão Rust precisa de uma
comparação específica de runtime, compatibilidade e empacotamento.
