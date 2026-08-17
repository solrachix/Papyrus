---
title: Switching Engines
---

# Switching Engines

Swap engines without changing UI components. Use the same `DocumentEngine` API.

```ts
const pdfEngine = new PDFJSEngine();
await pdfEngine.load('/sample.pdf');

const epubEngine = new EPUBEngine();
await epubEngine.load('/sample.epub');

const textEngine = new TextEngine();
await textEngine.load('Hello world');

// Experimental: CBZ with Rust/WASM and a zip.js fallback
const rustCbzEngine = new RustCBZEngine();
await rustCbzEngine.load({ type: 'comic', source: file });

// CBR still uses libarchive.js
const cbrEngine = new CBREngine();
await cbrEngine.load({ type: 'comic', source: file });
```

In the web demo, compare the implementations with:

- `/render?engine=cbz`: current CBZ engine using zip.js.
- `/render?engine=rust-cbz`: experimental CBZ engine using Rust/WASM.
- `/render?engine=cbr`: CBR/RAR engine using libarchive.js.

The Rust/WASM path is opt-in until browser performance gains are measured on
real files. Its zip.js fallback keeps documents open when the Rust runtime is
unavailable.

<DemoFrame />

<DemoActions :actions="[
  { label: 'Load engine: pdf', action: 'set-engine', value: 'pdf' },
  { label: 'Load engine: epub', action: 'set-engine', value: 'epub' },
  { label: 'Load engine: text', action: 'set-engine', value: 'text' }
]" />
