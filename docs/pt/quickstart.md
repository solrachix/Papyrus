---
title: "Quickstart (Web)"
description: "Este guia segue o exemplo em examples/web. Papyrus suporta PDF, EPUB e TXT, mas o quickstart usa PDF.js por simplicidade."
---
# Quickstart (Web)

Este guia segue o exemplo em `examples/web`.
Papyrus suporta PDF, EPUB e TXT, mas o quickstart usa PDF.js por simplicidade.

## 1) Instale deps

Na raiz do repo:

```bash
pnpm install
```

## 1.1) Setup no Vite (worker do PDF.js + Tailwind)

A UI do Papyrus usa classes compativeis com Tailwind. Tailwind e recomendado.

```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Instale o PDF.js:

```bash
pnpm add pdfjs-dist
```

Configure o worker do PDF.js antes de usar a engine:

```ts
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker?url';
import { configurePdfjsWorker, setPdfjsLib } from '@papyrus-sdk/engine-pdfjs';

setPdfjsLib(pdfjsLib);
configurePdfjsWorker(workerUrl, pdfjsLib);
```

Se voce nao quiser Tailwind, importe o CSS de fallback:

```ts
import '@papyrus-sdk/ui-react/base.css';
```

## 2) Inicialize store e engine

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

## 3) Escute eventos

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus-sdk/core';

papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED, ({ annotation }) => {
  // Salvar no backend
});
```

## Proximo

- [Arquitetura](/pt/architecture)
- [Configuracao](/pt/configuration)
- [Fluxos](/pt/flows)

