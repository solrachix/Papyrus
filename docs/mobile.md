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
- Visual annotation tools (highlight/underline/squiggly/strikeout/ink) are currently PDF-only.
- UI is built in React Native and mirrors web flows.
- Expo prebuild is supported via `@papyrus-sdk/expo-plugin`.

## Mobile UX baseline (reference for Web and RN)

For small screens, keep this interaction baseline:

- Header keeps key actions visible.
- Left side: menu button (thumbnails) plus a pencil button to open/close the annotation dock.
- Center: page navigation stays centered.
- Right side: search sits next to the `...` overflow button.
- Remove long branding on mobile (for example `PapyrusCore`) to prioritize title and controls.

`...` quick actions modal:

- Include zoom controls (`-` and `+`) with current percentage.
- Include page theme options.
- Include UI theme toggle with an icon.
- Include upload action with an icon.
- Do not duplicate search inside the modal when search is already visible in the header.
- Keep the modal open after page/UI theme changes.
- Enforce readable border/text contrast (avoid black-on-black).

Layout behavior:

- Thumbnail and search side panels should open as overlays, not push the page rendering sideways.
- Header and bottom navigation can auto-hide while scrolling down, and reappear when scrolling up.
- Viewer should support pinch-to-zoom (two-finger gesture) on touch devices.
- Annotation dock should start closed and open only via explicit action (pencil button).
- If the dock closes, nested popovers (for example color picker) should close too.
- Bottom sheet/modal must render above the annotation dock (higher z-index/layer).

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

## Performance tuning flags (RN UI)

`@papyrus-sdk/ui-react-native` exposes tuning props for large documents:

```tsx
<Viewer
  engine={engine}
  virtualWindowSize={8}
  maxToRenderPerBatch={6}
  removeClippedSubviews
/>

<RightSheet engine={engine} thumbsInitialCount={4} />
```

- `virtualWindowSize` (`Viewer`): FlatList window size.
- `maxToRenderPerBatch` (`Viewer`): items rendered per batch.
- `removeClippedSubviews` (`Viewer`): detaches offscreen rows.
- `thumbsInitialCount` (`RightSheet`): initial thumbnail render count.

## Performance tips (mobile)

- Keep `Viewer` mounted before `engine.load(...)` for EPUB/TXT.
- Prefer URI-based source for local files (`{ uri: 'file:///...' }`).
- Start with smaller list windows on mid-tier Android when docs are large (500+ pages).

## Large files (EPUB/PDF) troubleshooting

- Do not convert large local files to base64 on the RN bridge (high OOM risk).
- Use URI load path and let the runtime fetch/open EPUB as `ArrayBuffer`.
- Current timeout defaults:
  - WebView bridge `load` response: `180000ms`
  - Runtime `epub.open` / `epub.ready`: `180000ms`
  - Runtime `epub.display`: `30000ms`
- On ~4GB Android devices, large EPUBs may have visible first-open delay due to zip parse + spine setup.

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

If you are testing on a physical Android device, use `scrcpy` to mirror and control the phone from your computer while the app is running.

## Next steps

- [Open Source PDF SDK](/open-source-pdf-sdk)
- [Quickstart](/quickstart)
- [Configuration](/configuration)
