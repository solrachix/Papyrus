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
```
