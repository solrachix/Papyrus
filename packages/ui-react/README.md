# Papyrus UI React

React components for Papyrus web viewers.

## Install

```bash
npm install @papyrus-sdk/ui-react
```

## Usage

```tsx
import { Viewer } from '@papyrus-sdk/ui-react';
import { PDFJSEngine } from '@papyrus-sdk/engine-pdfjs';

const engine = new PDFJSEngine();
await engine.load({ type: 'pdf', source: { uri: 'https://example.com/book.pdf' } });

<Viewer engine={engine} />
```

## Topbar customization

`Topbar` accepts optional flags to show/hide controls.

```tsx
import { Topbar } from '@papyrus-sdk/ui-react';

<Topbar
  engine={engine}
  showBrand={false}
  showUpload={false}
  showUIToggle={false}
  showPageThemeSelector={false}
  showSearch={false}
/>;
```

Props:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `showBrand` | `boolean` | `true` | Show the PapyrusCore brand. |
| `brand` | `ReactNode` | `undefined` | Replace the brand area with custom content. |
| `title` | `ReactNode` | `undefined` | Optional document title shown in the header. |
| `showSidebarLeftToggle` | `boolean` | `true` | Show the left sidebar toggle button. |
| `showPageControls` | `boolean` | `true` | Show page navigation controls. |
| `showZoomControls` | `boolean` | `true` | Show zoom controls. |
| `showPageThemeSelector` | `boolean` | `true` | Show page theme selector (normal/sepia/dark/contrast). |
| `showUIToggle` | `boolean` | `true` | Show light/dark toggle. |
| `showUpload` | `boolean` | `true` | Show upload button. |
| `showSearch` | `boolean` | `true` | Show search button. |
