---
title: "PDF SDK for React Native (iOS & Android)"
description: "React Native PDF SDK with a native engine bridge for iOS and Android."
---
# PDF SDK for React Native (iOS & Android)

Papyrus mobile uses React Native UI plus a native engine bridge for PDF rendering on iOS and Android.

**What it is:** a React Native PDF SDK with native rendering.  
**Who it's for:** teams building reader UX on iOS + Android.  
**When to use:** you need native PDF performance and shared UI logic.  
**When not to use:** you only need web rendering.

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

Build all packages before running the examples:
```bash
pnpm -r --filter "./packages/**" --sort --workspace-concurrency=1 build
```

Android APK (RN CLI example):
```bash
cd examples/mobile/android
./gradlew assembleRelease
```

Install on emulator/device:
```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

## Next steps

- [Open Source PDF SDK](/open-source-pdf-sdk)
- [Quickstart](/quickstart)
- [Configuration](/configuration)

