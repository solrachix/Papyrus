
# ⚙️ Guia de Configuração — Papyrus SDK

O Papyrus foi desenhado para ser totalmente controlado pelo desenvolvedor via o objeto `PapyrusConfig`.

## 🚀 Como Inicializar

No seu componente principal (ex: `App.tsx`), você deve usar o método `initializeStore` antes de carregar o documento.

```tsx
import { useViewerStore } from '@papyrus/core';

const config = {
  initialPage: 10,
  initialUITheme: 'dark',
  initialAnnotations: mySavedAnnotations
};

useViewerStore.getState().initializeStore(config);
```

---

## 🛠️ Opções Disponíveis

| Propriedade | Tipo | Descrição |
| :--- | :--- | :--- |
| `initialPage` | `number` | Página que será exibida ao carregar (Padrão: 1). |
| `initialZoom` | `number` | Nível de zoom inicial (1.0 = 100%). |
| `initialRotation`| `number` | Rotação inicial em graus (0, 90, 180, 270). |
| `initialUITheme` | `'light' \| 'dark'` | Tema da interface (Barras laterais e menus). |
| `initialPageTheme`| `PageTheme` | Filtro visual da página (`normal`, `sepia`, `dark`, `high-contrast`). |
| `initialAnnotations`| `Annotation[]`| Array de anotações pré-existentes vindas do seu backend. |
| `sidebarLeftOpen` | `boolean` | Define se a barra de miniaturas começa aberta. |
| `sidebarRightOpen`| `boolean` | Define se a barra de busca/notas começa aberta. |

---

## 💾 Salvando Anotações

Para salvar anotações no seu banco de dados, escute o evento de criação:

```tsx
import { papyrusEvents, PapyrusEventType } from '@papyrus/core';

papyrusEvents.on(PapyrusEventType.ANNOTATION_CREATED, ({ annotation }) => {
  fetch('/api/annotations', {
    method: 'POST',
    body: JSON.stringify(annotation)
  });
});
```

## 🎨 Customização Visual

Os componentes do `@papyrus/ui-react` utilizam Tailwind CSS. Você pode sobrescrever os estilos ou injetar seu próprio CSS global para alterar cores de destaque e fontes.
