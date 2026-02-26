# Papyrus UI React Native

React Native UI components for Papyrus viewers.

## Install

```bash
npm install @papyrus-sdk/ui-react-native @papyrus-sdk/engine-native @papyrus-sdk/core @papyrus-sdk/types
```

`@papyrus-sdk/core` and `@papyrus-sdk/types` are required peer dependencies.

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
