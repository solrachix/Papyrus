# Papyrus UI React

React components for Papyrus web viewers.

## Install

```bash
npm install @papyrus-sdk/ui-react
```

## Usage

```tsx
import { Viewer } from '@papyrus-sdk/ui-react';
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';

const engine = new PDFJSEngine();
await engine.load({ type: 'pdf', source: { uri: 'https://example.com/book.pdf' } });

<Viewer engine={engine} />
```
