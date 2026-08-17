# Papyrus Engine Native

React Native native engine for PDF rendering (PDFKit on iOS, PDFium on Android),
plus a WebView runtime for EPUB/TXT/CBZ via `MobileDocumentEngine`.

## Install

```bash
npm install @papyrus-sdk/engine-native @papyrus-sdk/core @papyrus-sdk/types
```

`@papyrus-sdk/core` and `@papyrus-sdk/types` are required peer dependencies.

For EPUB/TXT/CBZ on mobile, also install:

```bash
npm install react-native-webview
```

CBZ files use the same WebView dependency and are loaded with
`{ type: 'comic', source: { uri: 'file:///.../book.cbz' } }`. CBR is not part
of the base mobile runtime because its libarchive worker/WASM payload is
optional and substantially larger.

For CBR, install `@papyrus-sdk/engine-cbr-mobile` and pass its three runtime
asset URLs through `webViewRuntimeConfig` as shown in that package's README.

## Usage

```ts
import { MobileDocumentEngine, PapyrusPageView } from '@papyrus-sdk/engine-native';
import { findNodeHandle } from 'react-native';

const engine = new MobileDocumentEngine();
await engine.load({ type: 'pdf', source: { uri: 'https://example.com/book.pdf' } });

// Render the first page into a native view
const viewTag = findNodeHandle(pageViewRef.current);
if (viewTag) {
  await engine.renderPage(0, viewTag, 2);
}
```

Notes:
- Requires a native build (not Expo Go).
- Use `PapyrusPageView` for native PDF rendering.
