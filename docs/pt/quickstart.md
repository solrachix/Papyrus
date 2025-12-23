# Quickstart (Web)

Este guia segue o exemplo em `examples/web`.

## 1) Instale deps

Na raiz do repo:

```bash
pnpm install
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
