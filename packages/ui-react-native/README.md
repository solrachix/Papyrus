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
