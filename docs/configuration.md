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
| `initialZoom` | `number` | Initial zoom level (1.0 = 100%). |
| `initialRotation` | `number` | Initial rotation in degrees (0, 90, 180, 270). |
| `initialUITheme` | `'light' \| 'dark'` | UI theme (sidebars and menus). |
| `initialPageTheme` | `PageTheme` | Page filter (`normal`, `sepia`, `dark`, `high-contrast`). |
| `initialAccentColor` | `string` | Accent color (hex) for active UI states. |
| `initialAnnotations` | `Annotation[]` | Preloaded annotations from your backend. |
| `sidebarLeftOpen` | `boolean` | Whether the thumbnail sidebar starts open. |
| `sidebarRightOpen` | `boolean` | Whether the search/notes sidebar starts open. |

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
| `showSidebarLeftToggle` | `boolean` | Show the left sidebar toggle button. |
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

