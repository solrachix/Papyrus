# Mobile

Papyrus mobile uses React Native UI plus a native engine bridge.

## Packages

- `@papyrus-sdk/engine-native` for iOS (PDFKit) and Android (PDFium)
- `@papyrus-sdk/ui-react-native` for the viewer, sheets, and toolbars

## Status

- PDF rendering stays native (Android PDFium + iOS PDFKit).
- EPUB/TXT render inside a WebView runtime (epub.js + DOM) while keeping the same UI shell.
- Text search and selection are handled per engine.
- UI is built in React Native and mirrors web flows.
- Expo prebuild is supported via `@papyrus-sdk/expo-plugin`.

## Document types

`DocumentType` includes:
`'pdf' | 'epub' | 'text'`

Use the new load request to force the type:

```ts
import { MobileDocumentEngine } from '@papyrus-sdk/engine-native';

const engine = new MobileDocumentEngine();
await engine.load({ type: 'epub', source: { uri: 'https://example.com/book.epub' } });
```

Compatibility is preserved:
`engine.load(source)` still works and the type is inferred from URI extension or data URI mime (fallback to `pdf`).

## WebView requirement

EPUB/TXT require `react-native-webview` in the host app:

```bash
npm install react-native-webview
```

For RN CLI apps, make sure Metro treats `html` as an asset so the runtime can load:

```js
// metro.config.js
resolver: {
  assetExts: [...assetExts, 'pdf', 'html'],
},
```

When loading EPUB/TXT, render `<Viewer />` before awaiting `engine.load(...)` so the WebView runtime can initialize.

## Notes

Mobile requires native build steps (Xcode / Android Studio). Examples live in:
- `examples/mobile` (RN CLI)
- `examples/mobile-expo` (Expo + prebuild)
