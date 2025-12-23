# Configuration

Papyrus is configured through `PapyrusConfig` before loading a document.

## Initialize

```tsx
import { useViewerStore } from '@papyrus/core';

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

## Events

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus/core';

papyrusEvents.on(PapyrusEventType.PAGE_CHANGED, ({ pageNumber }) => {
  console.log('page', pageNumber);
});
```
