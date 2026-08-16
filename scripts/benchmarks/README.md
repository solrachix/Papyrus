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

## Medição no browser

Com o demo web em `http://localhost:3005/`, o PDF de 1000 páginas foi carregado
pelo controle de upload local. Três execuções chegaram a 1007 canvases em
686–763 ms: 996 thumbnails, 7 páginas principais visíveis e 4 canvases
auxiliares. Isso mede o carregamento do documento e o primeiro lote de
renderização da UI virtualizada; não significa que as 1000 páginas principais
foram rasterizadas simultaneamente.
