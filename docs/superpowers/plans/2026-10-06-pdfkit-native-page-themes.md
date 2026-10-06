# PDFKit native page themes implementation plan

> Use this plan in the dedicated Papyrus worktree and the already-isolated mobile reader worktree. Preserve unrelated work in both repositories.

**Goal:** Render Original, Sepia, Dark, and High Contrast inside the existing iOS PDFView, keep Papyrus overlays in their own colors, and default Papel Amassado to the original page with its current dark UI.

**Architecture:** Register a custom `PDFPage` through a delegate retained as an associated object by each `PDFDocument`. Use token-scoped leases for active themes. Custom drawing reads `pageRef` and applies `transformContext:forBox:` rather than mutating `displaysAnnotations`; visible annotations are drawn after the theme. Compatibility keeps its existing raster/CI path. Remove the page-theme eligibility fallback and change only the app's initial page theme.

## Papyrus tasks

- Add failing tests for iOS eligibility under every page theme, unchanged Android eligibility, delegate/page-class ownership, annotation-safe drawing without shared state mutation, token-scoped leases, and theme invalidation without replacing the PDF document.
- Implement `PapyrusThemedPdfPage` and its `PDFDocumentDelegate` in the native engine, retaining the delegate on its exact `PDFDocument` with an associated object.
- Install the delegate when storing a newly loaded document, before page count or page access.
- Add native theme lease/update/release calls to the per-document delegate; acquire on native PDF document attach, update on `pageTheme`, release on document change/dealloc. Each view owns a unique token; stale tokens cannot clear another view's theme.
- Invalidate the existing `PDFView` and descendant page views after theme updates without replacing the document or resetting viewport state.
- Draw non-normal page content using `PDFPage.pageRef` plus `transformContext:forBox:`, apply the Core Graphics page theme, then redraw visible PDF annotations in page coordinates. Do not mutate `displaysAnnotations` or any page state during drawing.
- Remove `pageTheme === "normal"` from iOS native-view eligibility and remove the unsupported-page-theme warning; preserve all other capability gates.
- Keep `PapyrusPageView`'s existing Core Image fallback behavior when no native theme lease is active.
- Run the focused native-view/theme contracts, existing page-rotation/PDF viewer contracts, package tests, package builds, ESLint, and `git diff --check`.

## Papel Amassado tasks

- Change only `initialPageTheme` to `normal` in `createReadingPapyrusConfig`; retain `initialUITheme: 'dark'`.
- Update the reading config test to prove the white page default and dark UI default together.
- Run the focused reading layout test and mobile-rn lint/type checks available for the changed files.
- Follow `apps/mobile-rn/docs/ota-updates.md` when reporting delivery: the app default is JS, but the new PDFPage behavior is native and requires a matching iOS binary; an OTA alone cannot add it.

## Final review

- Verify original/Papyrus annotations are redrawn after themed content and that selection/search/PencilKit contracts are untouched.
- Verify theme switching preserves page, zoom, selection, search/active result, annotations and PencilKit, including rotation 0→90→0 and leaving the native viewer for a compatibility capability.
- Verify no Android eligibility or renderer code changed.
- Verify page changes do not replace the `PDFDocument`, current page, zoom, or store selection/search state.
- Do not publish npm packages or TestFlight as part of the code change.
- Do not claim iOS compilation or device validation without a real Apple build/smoke. Record the smoke gate explicitly.
