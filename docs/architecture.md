---
title: "Architecture"
description: "Papyrus is split into small layers so UI and engine can evolve independently."
---
# Architecture

Papyrus is split into small layers so UI and engine can evolve independently.

## Packages

| Package | Role |
| --- | --- |
| `@papyrus-sdk/types` | Shared contracts (DocumentEngine, Annotation, events). |
| `@papyrus-sdk/core` | Store + events (`useViewerStore`, `papyrusEvents`). |
| `@papyrus-sdk/engine-pdfjs` | Web engine adapter on top of PDF.js. |
| `@papyrus-sdk/engine-cbz` | Web CBZ adapter using ZIP/zip.js. |
| `@papyrus-sdk/engine-cbr` | Web CBR adapter using RAR/libarchive. |
| `@papyrus-sdk/engine-cbz-rust` | Experimental CBZ adapter using Rust/WASM with a zip.js fallback. |
| `@papyrus-sdk/ui-react` | Web UI for reader, search, and navigation. |
| `@papyrus-sdk/engine-native` | iOS/Android bridge (PDFKit, PDFium). |
| `@papyrus-sdk/ui-react-native` | Mobile UI with sheets and toolbars. |

## Data flow

1. Engine loads the document and exposes page count, outline, text.
2. UI components call engine methods and update store state.
3. `papyrusEvents` emits lifecycle and annotation events for your app.

## Engine agnostic

UI components never import PDF.js or native code directly. They talk to the
`DocumentEngine` interface so you can swap engines without changing UI logic.

For comics, the same boundary supports `CBZEngine`, `CBREngine`, and the
experimental Rust/WASM CBZ adapter. The `engine=rust-cbz` demo route uses Rust
to list and extract CBZ pages and falls back to `zip.js` if WASM initialization
fails. The regular `engine=cbz` route remains available as the baseline.

CBR still uses `libarchive.js`. A Rust RAR/CBR engine is not integrated yet and
requires a separate benchmark for compatibility, extraction, memory, and
artifact size before it should replace the current path.
