---
title: Demo
---

# Demo

O demo e gerado a partir de `examples/web` e embutido aqui. O PDF padrao e o TraceMonkey local em `examples/web/assets`. Para trocar entre PDF/EPUB/TXT, edite `examples/web/App.tsx` e ajuste as constantes da engine/source.

<DemoFrame />

## Eventos

Escute eventos do SDK e envie para o console do docs.

```ts
papyrusEvents.on(PapyrusEventType.DOCUMENT_LOADED, (payload) => {
  console.log('Document loaded', payload);
});

papyrusEvents.on(PapyrusEventType.TEXT_SELECTED, (payload) => {
  console.log('Text selected', payload);
});
```

<DemoActions :actions="[
  { label: 'Ativar event log', action: 'set-event-log', value: true },
  { label: 'Desativar event log', action: 'set-event-log', value: false }
]" />

<DemoEventLog />
