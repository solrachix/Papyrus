---
title: Demo
---

# Demo

The demo is built from `examples/web` and embedded here. The default PDF is the local TraceMonkey sample in `examples/web/assets`. To switch between PDF/EPUB/TXT, edit `examples/web/App.tsx` and update the engine/source constants.

<DemoFrame />

## Events

Listen to SDK events and forward them to the docs console.

```ts
papyrusEvents.on(PapyrusEventType.DOCUMENT_LOADED, (payload) => {
  console.log('Document loaded', payload);
});

papyrusEvents.on(PapyrusEventType.TEXT_SELECTED, (payload) => {
  console.log('Text selected', payload);
});
```

<DemoActions :actions="[
  { label: 'Enable event log', action: 'set-event-log', value: true },
  { label: 'Disable event log', action: 'set-event-log', value: false }
]" />

<DemoEventLog />
