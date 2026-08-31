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

Para o emulador `Pixel_7_API_35`, o APK do benchmark deve ser construído com
`x86_64`. GIF/WebP são opcionais e ficam desativados nesse artefato para manter
o limite de 30 MiB; isso não altera a configuração padrão multi-ABI do app.

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
