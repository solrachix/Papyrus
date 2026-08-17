---
title: Troca de Engine
---

# Troca de Engine

Troque a engine sem mudar os componentes de UI.

```ts
const pdfEngine = new PDFJSEngine();
await pdfEngine.load('/sample.pdf');

const epubEngine = new EPUBEngine();
await epubEngine.load('/sample.epub');

const textEngine = new TextEngine();
await textEngine.load('Hello world');

// Experimental: CBZ com Rust/WASM e fallback para zip.js
const rustCbzEngine = new RustCBZEngine();
await rustCbzEngine.load({ type: 'comic', source: file });

// CBR continua usando libarchive.js
const cbrEngine = new CBREngine();
await cbrEngine.load({ type: 'comic', source: file });
```

No demo web, compare as implementacoes em:

- `/render?engine=cbz`: CBZ atual com zip.js.
- `/render?engine=rust-cbz`: CBZ experimental com Rust/WASM.
- `/render?engine=cbr`: CBR/RAR com libarchive.js.

O caminho Rust/WASM e opt-in enquanto os ganhos de desempenho no navegador
nao forem medidos em arquivos reais. O fallback para zip.js preserva a
abertura do documento quando o runtime Rust nao estiver disponivel.

<DemoFrame />

<DemoActions :actions="[
  { label: 'Carregar engine: pdf', action: 'set-engine', value: 'pdf' },
  { label: 'Carregar engine: epub', action: 'set-engine', value: 'epub' },
  { label: 'Carregar engine: text', action: 'set-engine', value: 'text' }
]" />
