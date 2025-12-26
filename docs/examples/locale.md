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
```
