---
title: "Configuracao"
description: "Papyrus e configurado via PapyrusConfig antes de carregar o documento."
---
# Configuracao

Papyrus e configurado via `PapyrusConfig` antes de carregar o documento.

## Inicializar

```tsx
import { useViewerStore } from '@papyrus-sdk/core';

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

## Estilos da UI (web)

Para web, voce pode usar Tailwind (recomendado) ou o CSS de fallback:

```ts
import '@papyrus-sdk/ui-react/base.css';
```

## Variaveis de tema (web)

O Papyrus UI expoe variaveis CSS para customizar cores. Elas sao aplicadas em
elementos com a classe `papyrus-theme` e respondem ao atributo
`data-papyrus-theme="light|dark"`.

```ts
const root = document.documentElement;
root.style.setProperty('--papyrus-surface', '#1b2b3a');
root.style.setProperty('--papyrus-surface-2', '#223243');
root.style.setProperty('--papyrus-border', '#2f4256');
root.style.setProperty('--papyrus-text', '#e6edf3');
root.style.setProperty('--papyrus-text-muted', '#9fb0c2');
root.style.setProperty('--papyrus-canvas', '#0f172a');
```

## Eventos

```ts
import { papyrusEvents, PapyrusEventType } from '@papyrus-sdk/core';

papyrusEvents.on(PapyrusEventType.PAGE_CHANGED, ({ pageNumber }) => {
  console.log('pagina', pageNumber);
});
```

