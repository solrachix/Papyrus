# Architecture

Papyrus is split into small layers so UI and engine can evolve independently.

## Packages

| Package | Role |
| --- | --- |
| `@papyrus/types` | Shared contracts (DocumentEngine, Annotation, events). |
| `@papyrus/core` | Store + events (`useViewerStore`, `papyrusEvents`). |
| `@papyrus/engine-pdfjs` | Web engine adapter on top of PDF.js. |
| `@papyrus/ui-react` | Web UI for reader, search, and navigation. |
| `@papyrus/engine-native` | iOS/Android bridge (PDFKit, PDFium). |
| `@papyrus/ui-react-native` | Mobile UI with sheets and toolbars. |

## Data flow

1. Engine loads the document and exposes page count, outline, text.
2. UI components call engine methods and update store state.
3. `papyrusEvents` emits lifecycle and annotation events for your app.

## Engine agnostic

UI components never import PDF.js or native code directly. They talk to the
`DocumentEngine` interface so you can swap engines without changing UI logic.
