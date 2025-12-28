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
```

<DemoFrame />

<DemoActions :actions="[
  { label: 'Carregar engine: pdf', action: 'set-engine', value: 'pdf' },
  { label: 'Carregar engine: epub', action: 'set-engine', value: 'epub' },
  { label: 'Carregar engine: text', action: 'set-engine', value: 'text' }
]" />
