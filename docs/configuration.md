---
title: "Configuration"
description: "Papyrus is configured through PapyrusConfig before loading a document."
---
# Configuration

Papyrus is configured through `PapyrusConfig` before loading a document.

## Initialize

```tsx
import { useViewerStore } from '@papyrus-sdk/core';

useViewerStore.getState().initializeStore({
  initialPage: 3,
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialAccentColor: '#2563eb',
});
```

## Options

| Property | Type | Description |
| --- | --- | --- |
| `initialPage` | `number` | Page shown on load (default: 1). |
| `initialZoom` | `number` | Initial zoom level (1.0 = 100%, default: 1.0). |
| `initialRotation` | `number` | Initial rotation in degrees (0, 90, 180, 270). |
| `initialUITheme` | `'light' \| 'dark'` | UI theme (sidebars and menus). |
| `initialPageTheme` | `PageTheme` | Page filter (`normal`, `sepia`, `dark`, `high-contrast`). |
| `initialAccentColor` | `string` | Accent color (hex) for active UI states. |
| `initialAnnotations` | `Annotation[]` | Preloaded annotations from your backend. |
| `sidebarLeftOpen` | `boolean` | Whether the thumbnail/outline sidebar starts open. |
| `sidebarRightOpen` | `boolean` | Whether the search/notes sidebar starts open. |

### Sidebar defaults (web)

The left sidebar hosts thumbnails and the outline. Use `sidebarLeftOpen` to set the initial state, and the Topbar toggle (`showSidebarLeftToggle`) or `useViewerStore.getState().toggleSidebarLeft()` to open/close it from your UI.

## Annotation shape

```ts
type Annotation = {
  id: string;
  type: 'highlight' | 'underline' | 'squiggly' | 'strikeout' | 'text' | 'comment' | 'ink';
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  rects?: { x: number; y: number; width: number; height: number }[];
  path?: { x: number; y: number }[];
  color: string;
  createdAt: number;
  content?: string;
};
```

- `rects` is used for text-based marks (highlight/underline/squiggly/strikeout).
- `path` is used for freehand drawings (ink).

## UI styling (web)

Papyrus UI uses utility-first class names compatible with Tailwind.

You can choose one of the following:

1) **Tailwind (recommended)**

```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

2) **Fallback CSS (no Tailwind)**

```ts
import '@papyrus-sdk/ui-react/base.css';
```

3) **Headless**

Use `@papyrus-sdk/core` + engines and build your own UI.

## Theme variables (web)

Papyrus UI exposes CSS variables so you can customize more than the accent color.
They are applied on elements with the `papyrus-theme` class and respond to the
`data-papyrus-theme="light|dark"` attribute.

Example:

```ts
const root = document.documentElement;
root.style.setProperty('--papyrus-surface', '#1b2b3a');
root.style.setProperty('--papyrus-surface-2', '#223243');
root.style.setProperty('--papyrus-border', '#2f4256');
root.style.setProperty('--papyrus-text', '#e6edf3');
root.style.setProperty('--papyrus-text-muted', '#9fb0c2');
root.style.setProperty('--papyrus-canvas', '#0f172a');
```

Common tokens:

- `--papyrus-surface`
- `--papyrus-surface-2`
- `--papyrus-border`
- `--papyrus-text`
- `--papyrus-text-muted`
- `--papyrus-canvas`

## Topbar customization (web)

The web `Topbar` component supports flags to hide UI elements.

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

Available props (all optional, default `true`):

| Prop | Type | Description |
| --- | --- | --- |
| `showBrand` | `boolean` | Show the PapyrusCore brand. |
| `brand` | `ReactNode` | Replace the brand area with custom content. |
| `title` | `ReactNode` | Optional document title shown in the header. |
| `showSidebarLeftToggle` | `boolean` | Show the left sidebar (thumbnails/outline) toggle button. |
| `showPageControls` | `boolean` | Show page navigation controls. |
| `showZoomControls` | `boolean` | Show zoom controls. |
| `showPageThemeSelector` | `boolean` | Show page theme selector. |
| `showUIToggle` | `boolean` | Show light/dark toggle. |
| `showUpload` | `boolean` | Show upload button. |
| `showSearch` | `boolean` | Show search button. |

## Events

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus-sdk/core';

papyrusEvents.on(PapyrusEventType.PAGE_CHANGED, ({ pageNumber }) => {
  console.log('page', pageNumber);
});
```
