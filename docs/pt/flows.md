# Fluxos principais

Esta pagina mostra os fluxos do core entre store e eventos.

## Busca

```ts
import { SearchService } from '@papyrus-sdk/core';

const service = new SearchService(engine);
const results = await service.search('paper');
useViewerStore.getState().setSearch('paper', results);
```

## Anotacoes

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus-sdk/core';

papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED, ({ annotation }) => {
  // Persistir no backend
});
```

## Navegacao e zoom

```ts
engine.goToPage(5);
engine.setZoom(1.25);
useViewerStore.getState().setDocumentState({ currentPage: 5, zoom: 1.25 });
```

## Temas

```ts
useViewerStore.getState().setDocumentState({
  uiTheme: 'dark',
  pageTheme: 'sepia',
  accentColor: '#2563eb',
});
```
