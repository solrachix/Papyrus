# Papyrus Engine PDF.js

Web engine for PDF documents, powered by PDF.js.

## Install

```bash
npm install @papyrus-sdk/engine-pdfjs @papyrus-sdk/core @papyrus-sdk/types pdfjs-dist
```

`@papyrus-sdk/core` and `@papyrus-sdk/types` are required peer dependencies.

## Usage

```ts
import { PDFJSEngine, setPdfjsLib, configurePdfjsWorker } from '@papyrus-sdk/engine-pdfjs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';

setPdfjsLib(pdfjsLib);
configurePdfjsWorker(workerUrl, pdfjsLib);

const engine = new PDFJSEngine();
await engine.load({ type: 'pdf', source: { uri: 'https://example.com/book.pdf' } });
```
