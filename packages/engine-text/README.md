# Papyrus Engine Text

Web engine for plain text documents.

## Install

```bash
npm install @papyrus-sdk/engine-text
```

## Usage

```ts
import { TextEngine } from '@papyrus-sdk/engine-text';

const engine = new TextEngine();
await engine.load({ type: 'text', source: 'Hello world' });
```
