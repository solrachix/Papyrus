---
title: Exemplos
---

# Exemplos

Demo interativo para explorar PDF, EPUB e TXT. A configuracao fica em `examples/web/App.tsx`.

## Acoes rapidas

```ts
const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
};

// Runtime
setDocumentState({ uiTheme: 'light' });
setDocumentState({ pageTheme: 'high-contrast' });
```

<DemoActions :actions="[
  { label: 'Aplicar UI: light', action: 'set-ui-theme', value: 'light' },
  { label: 'Aplicar Page: high-contrast', action: 'set-page-theme', value: 'high-contrast' }
]" />

<DemoFrame />
