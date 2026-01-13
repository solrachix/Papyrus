# Papyrus Core

Shared core for Papyrus engines and UI state.

## Install

```bash
npm install @papyrus-sdk/core
```

## Usage

```ts
import { useViewerStore, papyrusEvents } from '@papyrus-sdk/core';

const { setDocumentState } = useViewerStore();
papyrusEvents.on('DOCUMENT_LOADED', (payload) => {
  console.log('Pages:', payload.pageCount);
});
```

See the Papyrus repo docs in `docs/` for more details.
