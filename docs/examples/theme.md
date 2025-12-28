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

<DemoFrame />

<DemoActions :actions="[
  { label: 'Apply UI: light', action: 'set-ui-theme', value: 'light' },
  { label: 'Apply Page: high-contrast', action: 'set-page-theme', value: 'high-contrast' }
]" />
