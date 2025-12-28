---
title: Troca de Tema
---

# Troca de Tema

Use `PapyrusConfig` para tema inicial e `setDocumentState` para mudar em tempo real.

```ts
const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
};

// Runtime
setDocumentState({ uiTheme: 'light' });
setDocumentState({ pageTheme: 'high-contrast' });
```

<DemoFrame />

<DemoActions :actions="[
  { label: 'Aplicar UI: light', action: 'set-ui-theme', value: 'light' },
  { label: 'Aplicar Page: high-contrast', action: 'set-page-theme', value: 'high-contrast' }
]" />
