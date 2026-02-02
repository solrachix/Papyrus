# Papyrus Engine EPUB

Web engine for EPUB documents, built on top of `epubjs`.

## Install

```bash
npm install @papyrus-sdk/engine-epub @papyrus-sdk/core @papyrus-sdk/types
```

`@papyrus-sdk/core` and `@papyrus-sdk/types` are required peer dependencies.

## Usage

```ts
import { EPUBEngine } from '@papyrus-sdk/engine-epub';

const engine = new EPUBEngine();
await engine.load({ type: 'epub', source: { uri: 'https://example.com/book.epub' } });
```
