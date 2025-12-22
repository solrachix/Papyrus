# Papyrus PDF SDK
> O ultimo motor de PDF que voce vai precisar.

[![Engine: PDF.js](https://img.shields.io/badge/Engine-PDF.js-orange.svg)](https://mozilla.github.io/pdf.js/)
[![Framework: React](https://img.shields.io/badge/Framework-React-blue.svg)](https://reactjs.org/)

Leia em: [English](README.md) | Portugues (Brasil)

Papyrus e um SDK modular de PDF feito para produtos com documentos pesados. Ele combina uma camada central de estado, engines plugaveis (PDF.js na web, nativo no mobile) e kits de UI para React e React Native.

## Documentacao
- [Guia de configuracao](docs/CONFIGURATION.pt-BR.md)
- [Event hooks](docs/CONFIGURATION.pt-BR.md#event-hooks)
- [Mobile (React Native)](docs/MOBILE.pt-BR.md)

## Funcionalidades
- Event hooks para pagina, zoom, selecao e anotacoes
- Busca textual em background com preview
- UI com temas: claro, escuro, sepia, alto contraste
- Arquitetura desacoplada: core, engines e pacotes de UI

## Pacotes
| Pacote | Responsabilidade |
| :--- | :--- |
| `@papyrus/types` | Tipos e contratos compartilhados |
| `@papyrus/core` | Store (Zustand), event bus, search service |
| `@papyrus/engine-pdfjs` | Adaptador PDF.js para web |
| `@papyrus/engine-native` | Engine nativa (iOS/Android) |
| `@papyrus/ui-react` | Componentes de UI em React |
| `@papyrus/ui-react-native` | Componentes de UI em React Native |

## Inicio rapido (web)
```bash
npm install
npm run dev
```
Abra a URL exibida pelo Vite.

## Uso minimo (web)
```tsx
import { useViewerStore, papyrusEvents } from '@papyrus/core';
import { PDFJSEngine } from '@papyrus/engine-pdfjs';
import { PapyrusConfig, PapyrusEventType } from '@papyrus/types';
import { Viewer, Topbar, SidebarLeft, SidebarRight } from '@papyrus/ui-react';

const engine = new PDFJSEngine();

const config: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPage: 1,
  sidebarLeftOpen: true
};

useViewerStore.getState().initializeStore(config);

const bootstrap = async () => {
  await engine.load('/sample.pdf');

  const store = useViewerStore.getState();
  store.setDocumentState({
    isLoaded: true,
    pageCount: engine.getPageCount(),
    outline: await engine.getOutline()
  });
};

bootstrap();

papyrusEvents.on(PapyrusEventType.DOCUMENT_LOADED, ({ pageCount }) => {
  console.log('Loaded pages:', pageCount);
});

// Na sua arvore React:
// <Topbar engine={engine} />
// <SidebarLeft engine={engine} />
// <Viewer engine={engine} />
// <SidebarRight engine={engine} />
```

## Exemplos
- Demo web: `examples/web`
- React Native: `examples/mobile`

## Contribuicao
Veja `CONTRIBUTING.md`.

## Licenca
MIT. Veja `LICENSE`.
