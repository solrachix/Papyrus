---
title: "Guia de Configuracao - Papyrus SDK"
description: "Leia em: English | Portugues (Brasil)"
canonical: "/pt/configuration"
head:
  - - meta
    - name: robots
      content: "noindex,follow"
---
# Guia de Configuracao - Papyrus SDK
Leia em: [English](configuration.md) | Portugues (Brasil)

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

## Formato de anotacao

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

- `rects` e usado para marcacoes de texto (highlight/underline/squiggly/strikeout).
- `path` e usado para desenho livre (ink).

## Estilos da UI (web)

A UI do Papyrus usa classes utilitarias compativeis com Tailwind.

Voce pode escolher um dos modos:

1) **Tailwind (recomendado)**

```bash
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

2) **CSS de fallback (sem Tailwind)**

```ts
import '@papyrus-sdk/ui-react/base.css';
```

3) **Headless**

Use `@papyrus-sdk/core` + engines e crie sua propria UI.

## Variaveis de tema (web)

O Papyrus UI expoe variaveis CSS para customizar mais do que o accent.
Elas sao aplicadas em elementos com a classe `papyrus-theme` e respondem ao
atributo `data-papyrus-theme="light|dark"`.

Exemplo:

```ts
const root = document.documentElement;
root.style.setProperty('--papyrus-surface', '#1b2b3a');
root.style.setProperty('--papyrus-surface-2', '#223243');
root.style.setProperty('--papyrus-border', '#2f4256');
root.style.setProperty('--papyrus-text', '#e6edf3');
root.style.setProperty('--papyrus-text-muted', '#9fb0c2');
root.style.setProperty('--papyrus-canvas', '#0f172a');
```

Tokens comuns:

- `--papyrus-surface`
- `--papyrus-surface-2`
- `--papyrus-border`
- `--papyrus-text`
- `--papyrus-text-muted`
- `--papyrus-canvas`

## Customizacao da Topbar (web)

A `Topbar` da web suporta flags para esconder elementos da UI.

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

Props disponiveis (todas opcionais, padrao `true`):

| Propriedade | Tipo | Descricao |
| --- | --- | --- |
| `showBrand` | `boolean` | Exibe o branding PapyrusCore. |
| `brand` | `ReactNode` | Substitui a area de branding. |
| `title` | `ReactNode` | Titulo opcional do documento no header. |
| `showSidebarLeftToggle` | `boolean` | Exibe o botao da sidebar esquerda. |
| `showPageControls` | `boolean` | Exibe navegacao de paginas. |
| `showZoomControls` | `boolean` | Exibe controles de zoom. |
| `showPageThemeSelector` | `boolean` | Exibe seletor de tema da pagina. |
| `showUIToggle` | `boolean` | Exibe toggle claro/escuro. |
| `showUpload` | `boolean` | Exibe botao de upload. |
| `showSearch` | `boolean` | Exibe botao de busca. |

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

