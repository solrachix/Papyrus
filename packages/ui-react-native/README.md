# Papyrus UI React Native

React Native UI components for Papyrus viewers.

## Install

```bash
npm install @papyrus-sdk/ui-react-native @papyrus-sdk/engine-native @papyrus-sdk/core @papyrus-sdk/types react-native-gesture-handler react-native-reanimated
```

`@papyrus-sdk/core`, `@papyrus-sdk/types`, `react-native-gesture-handler`, and `react-native-reanimated` are required peer dependencies.

Wrap the app root with `GestureHandlerRootView` before rendering Papyrus components:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

<GestureHandlerRootView style={{ flex: 1 }}>
  <App />
</GestureHandlerRootView>
```

For EPUB/TXT previews on mobile:

```bash
npm install react-native-webview
```

## Usage

```tsx
import { Viewer, CoverPreview } from '@papyrus-sdk/ui-react-native';
import { MobileDocumentEngine } from '@papyrus-sdk/engine-native';

const engine = new MobileDocumentEngine();
await engine.load({ type: 'pdf', source: { uri: 'https://example.com/book.pdf' } });

<Viewer engine={engine} />

<CoverPreview
  source={{ uri: 'https://example.com/book.epub' }}
  type="epub"
  style={{ width: 120, height: 180 }}
/>
```

## Topbar Customization

`Topbar` supports replacing the default "Papyrus" text and logo.

```tsx
<Topbar
  engine={engine}
  title="My Reader"
  logo={<MyLogoIcon />}
  onLogoPress={() => navigation.goBack()}
  onOpenSettings={() => setSettingsOpen(true)}
/>
```

- `title`: replaces the default brand text.
- `logo`: custom logo node (can be icon, image, or even a `Pressable`).
- `onLogoPress`: optional callback to make the logo area act like a button.

## Icon Guidelines

- UI icons for this package live in `packages/ui-react-native/icons.tsx`.
- Prefer inline SVG paths implemented with `react-native-svg` instead of adding a new icon runtime dependency.
- When a product icon does not already exist in the file, prefer using the outline SVG from [Tabler Icons](https://tabler.io/icons) as the visual baseline and adapt it to the local `IconProps` pattern.
- Keep icons stroke-based when possible, preserve `color`/`strokeWidth` as props, and simplify paths only when needed for better balance in mobile chrome.
- If an icon is intentionally derived from Tabler, keep that shape direction consistent for nearby controls so the toolbar/bottom-bar language stays coherent.

## Mobile Tuning Flags

Performance tuning props are available on `Viewer` and `RightSheet`:

```tsx
<Viewer
  engine={engine}
  virtualWindowSize={8}
  maxToRenderPerBatch={6}
  removeClippedSubviews
/>

<RightSheet engine={engine} thumbsInitialCount={4} />
```

- `virtualWindowSize` (`Viewer`): FlatList window size. Default: `8`.
- `maxToRenderPerBatch` (`Viewer`): max items per render batch. Default: `6`.
- `removeClippedSubviews` (`Viewer`): detach offscreen rows. Default: `true`.
- `thumbsInitialCount` (`RightSheet`): initial thumbnails rendered when opening pages tab. Default: `4`.

Recommended starting points:

- Mid-range Android + large docs (500+ pages): `virtualWindowSize={6}`, `maxToRenderPerBatch={4}`, `thumbsInitialCount={3}`.
- High-end devices: keep defaults (`8`, `6`, `4`) and tune only if you observe jank or memory pressure.

## Performance Tips (Mobile)

- Keep `Viewer` mounted before calling `engine.load(...)` for EPUB/TXT, so the WebView runtime is already ready.
- Prefer URI loads (`{ uri }`) for local files instead of pre-converting content to base64.
- For long documents, reduce `virtualWindowSize` and `maxToRenderPerBatch` first; then tune thumbnail pre-render count.
- On Android mid-tier devices (around 4 GB RAM), expect temporary memory spikes while parsing EPUB archives and generating first render.

## Mobile Performance Baseline (Audit Step)

Enable runtime diagnostics before rendering the viewer:

```ts
(globalThis as any).__PAPYRUS_MOBILE_PERF__ = {
  enabled: true,
  sampleMemory: true,
};
```

With diagnostics enabled, the native viewer emits structured logs such as:

- `[Papyrus Perf][Viewer] document.ready` with initial load time.
- `[Papyrus Perf][Viewer] scroll.*` with frame-gap and dropped-frame estimates.
- `[Papyrus Perf][RightSheet] memory.thumbnails.*` for memory snapshots when opening thumbnails.
- `[Papyrus Perf][CoreStore] setDocumentState.burst` when state updates happen in bursts.

Recommended baseline run:

1. Load a large PDF (1000+ pages).
2. Record `document.ready` for initial load.
3. Scroll quickly for 10-15 seconds and capture `scroll.*` logs.
4. Open thumbnails and capture `memory.thumbnails.*`.
5. Jump between distant pages and check for `setDocumentState.burst`.

## Large Files (EPUB/PDF) Troubleshooting

If large files fail to load or crash on mobile:

- Avoid RN bridge base64 conversion for large local files (OOM risk). Use `{ uri: 'file:///...' }`.
- EPUB on mobile WebView now fetches local URI content inside the runtime and opens from `ArrayBuffer`.
- If you see timeout errors:
  - WebView engine request timeout for `load`: `180000ms`
  - Runtime EPUB open/ready timeout: `180000ms`
  - Runtime EPUB display timeout: `30000ms`
- For very large EPUBs, first-open can take longer on mid-tier Android. This is expected due to zip parsing and spine bootstrapping.
