---
title: Theme Switching
---

# Theme Switching

Use `PapyrusConfig` for initial theme and `setDocumentState` for runtime changes.

```ts
const INITIAL_SDK_CONFIG: PapyrusConfig = {
  initialUITheme: 'dark',
  initialPageTheme: 'sepia',
};

// Runtime
setDocumentState({ uiTheme: 'light' });
setDocumentState({ pageTheme: 'high-contrast' });
```
