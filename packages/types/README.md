# Papyrus Types

Shared TypeScript types for Papyrus engines and UI packages.

## Install

```bash
npm install @papyrus-sdk/types
```

## Usage

```ts
import type { DocumentSource, DocumentType } from '@papyrus-sdk/types';

const source: DocumentSource = { uri: 'https://example.com/book.pdf' };
const type: DocumentType = 'pdf';
```
