# Core flows

This page shows how core flows are wired across the store and events.

## Search

Search uses `SearchService` and writes results into the store:

```ts
import { SearchService } from '@papyrus-sdk/core';

const service = new SearchService(engine);
const results = await service.search('paper');
useViewerStore.getState().setSearch('paper', results);
```

## Annotations

Annotations live in the store and emit events:

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus-sdk/core';

papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED, ({ annotation }) => {
  // Save to backend
});
```

## Navigation and zoom

```ts
engine.goToPage(5);
engine.setZoom(1.25);
useViewerStore.getState().setDocumentState({ currentPage: 5, zoom: 1.25 });
```

## Theming

```ts
useViewerStore.getState().setDocumentState({
  uiTheme: 'dark',
  pageTheme: 'sepia',
  accentColor: '#2563eb',
});
```
