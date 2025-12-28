---
title: Idioma
---

# Idioma

O idioma fica no estado do viewer. Pode setar no init ou trocar em tempo real.

```ts
const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialLocale: 'pt-BR',
};

// Runtime
setDocumentState({ locale: 'en' });
setDocumentState({ locale: 'pt-BR' });
```

<DemoFrame />

<DemoActions :actions="[
  { label: 'Aplicar locale: en', action: 'set-locale', value: 'en' },
  { label: 'Aplicar locale: pt-BR', action: 'set-locale', value: 'pt-BR' }
]" />
