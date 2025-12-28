---
title: Examples
---

# Examples

Use the interactive demo to explore PDF, EPUB, and TXT rendering. The demo source is configured directly in `examples/web/App.tsx`.

## Quick actions

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
  { label: 'Apply UI: light', action: 'set-ui-theme', value: 'light' },
  { label: 'Apply Page: high-contrast', action: 'set-page-theme', value: 'high-contrast' }
]" />

<DemoFrame />
