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

## Medição no browser

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
