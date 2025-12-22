# Configuration Guide - Papyrus SDK
Read this in: English | [Portuguese (Brazil)](CONFIGURATION.pt-BR.md)

Papyrus is configured through the `PapyrusConfig` object.

## Initialize
In your main component (e.g. `App.tsx`), call `initializeStore` before loading the document.

```tsx
import { useViewerStore } from '@papyrus/core';

const config = {
  initialPage: 10,
  initialUITheme: 'dark',
  initialAnnotations: mySavedAnnotations
};

useViewerStore.getState().initializeStore(config);
```

## Available options
| Property | Type | Description |
| :--- | :--- | :--- |
| `initialPage` | `number` | Page shown on load (default: 1). |
| `initialZoom` | `number` | Initial zoom level (1.0 = 100%). |
| `initialRotation` | `number` | Initial rotation in degrees (0, 90, 180, 270). |
| `initialUITheme` | `'light' \| 'dark'` | UI theme (sidebars and menus). |
| `initialPageTheme` | `PageTheme` | Page filter (`normal`, `sepia`, `dark`, `high-contrast`). |
| `initialAnnotations` | `Annotation[]` | Preloaded annotations from your backend. |
| `sidebarLeftOpen` | `boolean` | Whether the thumbnail sidebar starts open. |
| `sidebarRightOpen` | `boolean` | Whether the search/notes sidebar starts open. |

## Event hooks
To persist annotations in your database, listen for creation events:

```tsx
import { papyrusEvents, PapyrusEventType } from '@papyrus/core';

papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED, ({ annotation }) => {
  fetch('/api/annotations', {
    method: 'POST',
    body: JSON.stringify(annotation)
  });
});
```

## Visual customization
`@papyrus/ui-react` components use Tailwind CSS. You can override styles or inject global CSS to change accent colors and fonts.
