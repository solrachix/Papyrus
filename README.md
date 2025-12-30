# Papyrus PDF SDK
> The last document engine you will ever need.

[![Engine: PDF.js](https://img.shields.io/badge/Engine-PDF.js-orange.svg)](https://mozilla.github.io/pdf.js/)
[![Framework: React](https://img.shields.io/badge/Framework-React-blue.svg)](https://reactjs.org/)

Read this in: English | [Portuguese (Brazil)](README.pt-BR.md)

Papyrus is a modular document SDK built to power document-heavy products. It combines a core state layer, pluggable engines (PDF.js on web, native on mobile), and UI kits for React and React Native.

Supports PDF, EPUB, and TXT. On mobile, EPUB/TXT render via a WebView runtime while PDF stays native.

## Docs
- [Configuration guide](docs/CONFIGURATION.md)
- [Event hooks](docs/CONFIGURATION.md#event-hooks)
- [Mobile (React Native)](docs/MOBILE.md)

## Features
- Event hooks for page, zoom, selection, and annotations
- Document types: PDF, EPUB, TXT
- Background text search with preview
- Themeable UI: light, dark, sepia, high-contrast
- Decoupled architecture: core state, engines, and UI packages

## Packages
| Package | Responsibility |
| :--- | :--- |
| `@papyrus-sdk/types` | Shared types and contracts |
| `@papyrus-sdk/core` | Store (Zustand), event bus, search service |
| `@papyrus-sdk/engine-pdfjs` | PDF.js engine adapter for web |
| `@papyrus-sdk/engine-epub` | EPUB engine adapter for web |
| `@papyrus-sdk/engine-text` | TXT engine adapter for web |
| `@papyrus-sdk/engine-native` | Native engine bridge (iOS/Android) |
| `@papyrus-sdk/ui-react` | React UI components |
| `@papyrus-sdk/ui-react-native` | React Native UI components |
| `@papyrus-sdk/expo-plugin` | Expo config plugin for native builds |

## Quickstart (web)
```bash
npm install
npm run dev
```
Open the URL printed by Vite.

## Minimal usage (web)
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

// In your React tree:
// <Topbar engine={engine} />
// <SidebarLeft engine={engine} />
// <Viewer engine={engine} />
// <SidebarRight engine={engine} />
```

## Examples
- Web demo: `examples/web`
- React Native: `examples/mobile`

## Contributing
See `CONTRIBUTING.md`.

## License
MIT. See `LICENSE`.
