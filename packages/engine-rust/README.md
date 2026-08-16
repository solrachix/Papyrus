# @papyrus-sdk/engine-rust

Adapter incremental de PDF para o Papyrus. O PDF.js continua renderizando o
canvas e a camada visual; o core Rust/WASM assume extração de texto e busca.

## Uso

```ts
import { PDFJSEngine } from "@papyrus-sdk/engine-pdfjs";
import {
  RustDocumentEngine,
  createBundledWasmRustRuntimeFactory,
} from "@papyrus-sdk/engine-rust";

const engine = new RustDocumentEngine({
  pdfEngine: new PDFJSEngine(),
  runtimeFactory: createBundledWasmRustRuntimeFactory(),
});
```

O módulo WASM é carregado sob demanda na primeira chamada a `load`. Para
regenerar os artefatos depois de alterar o crate:

```bash
pnpm --filter @papyrus-sdk/engine-rust build:wasm
pnpm --filter @papyrus-sdk/engine-rust build
```

Esta é a primeira fatia da migração. `renderPage`, `renderTextLayer`,
`getTextContent`, dimensões, outline e seleção ainda ficam no PDF.js para
preservar o comportamento visual enquanto a busca Rust é medida em uso real.

A busca no navegador consulta as páginas em lotes assíncronos para não bloquear
o thread principal em PDFs grandes. O core mantém um cache LRU limitado a 64 MiB
do texto extraído; o cache evita reextrair as páginas a cada nova consulta sem
fazer a memória crescer indefinidamente.
