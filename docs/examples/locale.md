---
title: Locale
---

# Locale

Locale is stored in the viewer state. You can set it on init or switch at runtime.

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
  { label: 'Apply locale: en', action: 'set-locale', value: 'en' },
  { label: 'Apply locale: pt-BR', action: 'set-locale', value: 'pt-BR' }
]" />
