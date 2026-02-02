---
title: "Quickstart (Web)"
description: "This guide mirrors the web example in examples/web. Papyrus supports PDF, EPUB, and TXT, but the quickstart uses PDF.js for simplicity."
---
# Quickstart (Web)

This guide mirrors the web example in `examples/web`.
Papyrus supports PDF, EPUB, and TXT, but the quickstart uses PDF.js for simplicity.

## 1) Install deps

From the repo root:

```bash
pnpm install
```

## 1.1) Vite setup (PDF.js worker + Tailwind)

Papyrus UI uses Tailwind-compatible utility classes. Tailwind is recommended for best visuals.

```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Install PDF.js:

```bash
pnpm add pdfjs-dist
```

Configure the PDF.js worker once before using the engine:

```ts
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';
import { configurePdfjsWorker, setPdfjsLib } from '@papyrus-sdk/engine-pdfjs';

setPdfjsLib(pdfjsLib);
configurePdfjsWorker(workerUrl, pdfjsLib);
```

If you don't want Tailwind, you can import the fallback stylesheet:

```ts
import '@papyrus-sdk/ui-react/base.css';
```

## 2) Initialize store and engine

```tsx
import React, { useEffect, useState } from 'react';
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';
import { useViewerStore } from '@papyrus-sdk/core';
import { Topbar, SidebarLeft, SidebarRight, Viewer } from '@papyrus-sdk/ui-react';

const INITIAL_CONFIG = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialZoom: 1.1,
  initialAccentColor: '#2563eb',
};

export const App = () => {
  const [engine] = useState(() => new PDFJSEngine());
  const { initializeStore, setDocumentState, triggerScrollToPage } = useViewerStore();

  useEffect(() => {
    initializeStore(INITIAL_CONFIG);
    (async () => {
      await engine.load('https://example.com/sample.pdf');
      setDocumentState({
        isLoaded: true,
        pageCount: engine.getPageCount(),
        outline: await engine.getOutline(),
      });
      triggerScrollToPage(0);
    })();
    return () => engine.destroy();
  }, [engine, initializeStore, setDocumentState, triggerScrollToPage]);

  return (
    <div className="flex flex-col h-screen">
      <Topbar engine={engine} />
      <div className="flex flex-1 overflow-hidden">
        <SidebarLeft engine={engine} />
        <Viewer engine={engine} />
        <SidebarRight engine={engine} />
      </div>
    </div>
  );
};
```

## 3) Listen for events

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus-sdk/core';

papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED, ({ annotation }) => {
  // Persist to your backend
});
```

## Next

- [Architecture](/architecture)
- [Configuration](/configuration)
- [Flows](/flows)

