# Demo and Comparisons Design

**Status:** Approved for implementation

## Goal

Make the Papyrus documentation easier to evaluate by adding a dedicated interactive demo entry point and a structured comparisons area, while keeping the existing examples pages as technical documentation.

## Scope

- Add a dedicated `/demo` page that presents the existing functional web playground as the primary evaluation surface.
- Add a `/comparisons` page that explains the comparison methodology and links to existing product/category articles.
- Add Portuguese equivalents under `/pt/`.
- Add both areas to the VitePress navigation and sidebars.
- Keep the current `examples` pages for engine switching, events, themes, locale, and implementation details.

## Design

The dedicated demo reuses `DemoFrame` and the existing `examples/web` artifact, avoiding a second viewer implementation. Its copy focuses on capabilities users can try immediately: PDF, EPUB, TXT, CBZ/CBR where supported, upload, search, annotations, themes, and engine switching.

The comparisons landing page uses a capability-oriented matrix rather than unsupported performance claims. It links to the existing PDFTron/Apryse and open-source SDK articles. Any future percentage or latency claim must come from a reproducible benchmark with document, engine, browser/device, and command recorded.

The English and Portuguese pages follow the existing VitePress locale structure. Navigation labels are short and action-oriented (`Demo`, `Comparisons` / `Demo`, `Comparativos`).

## Validation

- Build the docs with `pnpm docs:build`.
- Verify `/demo`, `/pt/demo`, `/comparisons`, and `/pt/comparisons` render locally.
- Verify the demo iframe loads the current built artifact and the existing examples links remain valid.

