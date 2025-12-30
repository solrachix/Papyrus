# Papyrus PDF SDK
> O ultimo motor de documentos que voce vai precisar.

[![Engine: PDF.js](https://img.shields.io/badge/Engine-PDF.js-orange.svg)](https://mozilla.github.io/pdf.js/)
[![Framework: React](https://img.shields.io/badge/Framework-React-blue.svg)](https://reactjs.org/)

Leia em: [English](README.md) | Portugues (Brasil)

Papyrus e um SDK modular de documentos feito para produtos com documentos pesados. Ele combina uma camada central de estado, engines plugaveis (PDF.js na web, nativo no mobile) e kits de UI para React e React Native.

Suporta PDF, EPUB e TXT. No mobile, EPUB/TXT renderizam via WebView enquanto PDF fica nativo.

## Documentacao
- [Guia de configuracao](docs/CONFIGURATION.pt-BR.md)
- [Event hooks](docs/CONFIGURATION.pt-BR.md#event-hooks)
- [Mobile (React Native)](docs/MOBILE.pt-BR.md)

## Funcionalidades
- Event hooks para pagina, zoom, selecao e anotacoes
- Tipos de documento: PDF, EPUB, TXT
- Busca textual em background com preview
- UI com temas: claro, escuro, sepia, alto contraste
- Arquitetura desacoplada: core, engines e pacotes de UI

## Pacotes
| Pacote | Responsabilidade |
| :--- | :--- |
| `@papyrus-sdk/types` | Tipos e contratos compartilhados |
| `@papyrus-sdk/core` | Store (Zustand), event bus, search service |
| `@papyrus-sdk/engine-pdfjs` | Adaptador PDF.js para web |
| `@papyrus-sdk/engine-epub` | Adaptador EPUB para web |
| `@papyrus-sdk/engine-text` | Adaptador TXT para web |
| `@papyrus-sdk/engine-native` | Engine nativa (iOS/Android) |
| `@papyrus-sdk/ui-react` | Componentes de UI em React |
| `@papyrus-sdk/ui-react-native` | Componentes de UI em React Native |
| `@papyrus-sdk/expo-plugin` | Plugin Expo para builds nativos |

## Inicio rapido (web)
```bash
npm install
npm run dev
```
Abra a URL exibida pelo Vite.

## Uso minimo (web)
```tsx
import { useViewerStore, papyrusEvents } from '@papyrus-sdk/core';
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';
import { PapyrusConfig, PapyrusEventType } from '@papyrus-sdk/types';
import { Viewer, Topbar, SidebarLeft, SidebarRight } from '@papyrus-sdk/ui-react';

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
