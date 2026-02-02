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

## Styling modes

Papyrus UI uses utility-first class names compatible with Tailwind.

You can choose one of the following:

1) **Tailwind (recommended)**

```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

2) **Fallback CSS (no Tailwind)**

Import a minimal base stylesheet:

```ts
import '@papyrus-sdk/ui-react/base.css';
```

3) **Headless**

Use `@papyrus-sdk/core` + engines and build your own UI.

Note: `@papyrus-sdk/ui-react` expects `@papyrus-sdk/core` and `@papyrus-sdk/types` as peer dependencies.

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
