# Configuracao

Papyrus e configurado via `PapyrusConfig` antes de carregar o documento.

## Inicializar

```tsx
import { useViewerStore } from '@papyrus/core';

useViewerStore.getState().initializeStore({
  initialPage: 3,
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
  initialAccentColor: '#2563eb',
});
```

## Opcoes

| Propriedade | Tipo | Descricao |
| --- | --- | --- |
| `initialPage` | `number` | Pagina exibida ao carregar (padrao: 1). |
| `initialZoom` | `number` | Nivel de zoom inicial (1.0 = 100%). |
| `initialRotation` | `number` | Rotacao inicial em graus (0, 90, 180, 270). |
| `initialUITheme` | `'light' \| 'dark'` | Tema da interface (barras laterais e menus). |
| `initialPageTheme` | `PageTheme` | Filtro da pagina (`normal`, `sepia`, `dark`, `high-contrast`). |
| `initialAccentColor` | `string` | Cor de destaque (hex) para estados ativos da UI. |
| `initialAnnotations` | `Annotation[]` | Anotacoes pre-carregadas do backend. |
| `sidebarLeftOpen` | `boolean` | Sidebar de miniaturas inicia aberta. |
| `sidebarRightOpen` | `boolean` | Sidebar de busca/notas inicia aberta. |

## Eventos

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus/core';

papyrusEvents.on(PapyrusEventType.PAGE_CHANGED, ({ pageNumber }) => {
  console.log('pagina', pageNumber);
});
```
