# Papyrus Engine PDF.js

Web engine for PDF documents, powered by PDF.js.

## Install

```bash
npm install @papyrus-sdk/engine-pdfjs
```

## Usage

```ts
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';
import * as pdfjsLib from 'pdfjs-dist';

// pdfjsLib is expected as a global in the engine
(globalThis as any).pdfjsLib = pdfjsLib;

const engine = new PDFJSEngine();
await engine.load({ type: 'pdf', source: { uri: 'https://example.com/book.pdf' } });
```
