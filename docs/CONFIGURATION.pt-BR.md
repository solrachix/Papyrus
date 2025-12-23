# Guia de Configuracao - Papyrus SDK
Leia em: [English](CONFIGURATION.md) | Portugues (Brasil)

O Papyrus e configurado pelo objeto `PapyrusConfig`.

## Como inicializar
No seu componente principal (ex: `App.tsx`), chame `initializeStore` antes de carregar o documento.

```tsx
import { useViewerStore } from '@papyrus-sdk/core';

const config = {
  initialPage: 10,
  initialUITheme: 'dark',
  initialAnnotations: mySavedAnnotations
};

useViewerStore.getState().initializeStore(config);
```

## Opcoes disponiveis
| Propriedade | Tipo | Descricao |
| :--- | :--- | :--- |
| `initialPage` | `number` | Pagina exibida ao carregar (padrao: 1). |
| `initialZoom` | `number` | Nivel de zoom inicial (1.0 = 100%). |
| `initialRotation` | `number` | Rotacao inicial em graus (0, 90, 180, 270). |
| `initialUITheme` | `'light' \| 'dark'` | Tema da interface (barras laterais e menus). |
| `initialPageTheme` | `PageTheme` | Filtro visual da pagina (`normal`, `sepia`, `dark`, `high-contrast`). |
| `initialAccentColor` | `string` | Cor de destaque (hex) para estados ativos da UI. |
| `initialAnnotations` | `Annotation[]` | Anotacoes pre-existentes do seu backend. |
| `sidebarLeftOpen` | `boolean` | Define se a barra de miniaturas inicia aberta. |
| `sidebarRightOpen` | `boolean` | Define se a barra de busca/notas inicia aberta. |

## Event hooks
Para salvar anotacoes no seu banco de dados, escute o evento de criacao:

```tsx
import { papyrusEvents, PapyrusEventType } from '@papyrus-sdk/core';

papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED, ({ annotation }) => {
  fetch('/api/annotations', {
    method: 'POST',
    body: JSON.stringify(annotation)
  });
});
```

## Customizacao visual
Os componentes do `@papyrus-sdk/ui-react` usam Tailwind CSS. Voce pode sobrescrever estilos ou injetar CSS global para alterar cores e fontes. Use `initialAccentColor` para alinhar rapidamente com a marca.
