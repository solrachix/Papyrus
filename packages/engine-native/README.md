# Papyrus Engine Native

React Native native engine for PDF rendering (PDFKit on iOS, PDFium on Android),
plus a WebView runtime for EPUB/TXT via `MobileDocumentEngine`.

## Install

```bash
npm install @papyrus-sdk/engine-native @papyrus-sdk/core @papyrus-sdk/types
```

`@papyrus-sdk/core` and `@papyrus-sdk/types` are required peer dependencies.

For EPUB/TXT on mobile, also install:

```bash
npm install react-native-webview
```

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
