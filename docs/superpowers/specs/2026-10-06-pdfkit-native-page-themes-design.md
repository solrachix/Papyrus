# PDFKit native page themes design

## Goal

Keep the iOS native `PDFView` active for Original, Sepia, Dark, and High Contrast page themes, so changing the paper theme does not unmount PDFKit selection, search, annotations, or PencilKit. Make Papel Amassado start with the original white page while leaving its dark reader chrome unchanged.

## Current behavior

- `shouldUseNativePdfViewer` rejects iOS documents whenever `pageTheme !== "normal"`.
- `PapyrusPdfDocumentView` receives `pageTheme`, but only resets its background to white.
- The compatibility `PapyrusPageView` rasterizes pages and applies Core Image filters for Sepia, Dark, and High Contrast.
- The mobile reader config starts with dark UI and a Sepia page.

## Design

### Custom PDFPage through the document delegate

Add a `PapyrusThemedPdfPage` subclass and a per-document `PDFDocumentDelegate` that returns this page class from `classForPage()`. Install the delegate in `PapyrusEngineStore.setDocument` before resolving the page count or attaching the document to a view. Since `PDFDocument.delegate` is weak, retain the delegate with an Objective-C associated object on that exact `PDFDocument`; the delegate does not retain the document, so this creates no cycle.

The page class only applies a native theme while a native `PapyrusPdfDocumentView` holds a theme-rendering lease for that document. The delegate stores immutable theme values by unique lease token; each view can update or release only its own token, so an old view cannot clear a newer view's theme. With no active native lease the page calls `super` unchanged, preserving the compatibility renderer and its Core Image filters. Theme updates invalidate the existing PDFView/page views through public `UIView.setNeedsDisplay` calls; they do not replace the document or reset page, zoom, selection, search results, annotations, or ink overlays.

### Keep annotations and overlays independent

For a non-normal native page draw, use the public Objective-C `PDFPage.pageRef` and `PDFPage.transformContext:forBox:` APIs to draw the underlying `CGPDFPage` content into the provided context without touching `PDFPage.displaysAnnotations` or any other shared page state. Clip drawing to the requested CropBox, apply the theme with Core Graphics compositing while the content is in page draw, then draw every visible `PDFAnnotation` in page coordinates after the theme. This keeps original/Papyrus annotation colors out of the page transformation and avoids global mutable draw flags. Copy the active theme value under the delegate's lock, then draw from that immutable snapshot; never hold the lock while rendering. Normal theme and absent/unknown leases call the superclass unchanged.

The native theme semantics are defined at the page-content layer: Normal preserves source colors; Sepia gives the page and contents a warm paper tint; Dark desaturates and inverts page content to a dark page with light content; High Contrast uses the same dark polarity with stronger light/dark separation. These are vector/page-draw effects and are not persisted in the document. Papyrus annotations retain their own colors, while search selections, current selection and PencilKit remain in their PDFView/overlay layers. Visual parity with the existing compatibility Core Image filters is a device-smoke question, not assumed from source inspection.

Search highlights and the active text selection remain PDFView drawing layers. PencilKit remains its existing overlay view. No theme state is written into the PDF or Papyrus annotations.

### Eligibility and Papel Amassado default

Remove page theme as an iOS native-view eligibility restriction and remove the corresponding development fallback reason. Keep existing iOS restrictions for unavailable managers, double-page mode, non-zero viewer rotation, and unsupported ink overlay. Leave Android eligibility unchanged.

Change only `initialPageTheme` in Papel Amassado's reader configuration from `sepia` to `normal`. Keep `initialUITheme: "dark"`; chrome and page theme are independent settings.

## Failure handling and lifecycle

- A missing theme delegate or an unknown theme draws normally.
- Theme leases are tied to a document object, not just engine ID; each view uses a unique token, so a stale release cannot remove another view's active lease. Document replacement releases the old token and acquires one for the new document.
- A theme update refreshes PDFKit's existing page views without replacing the document.
- Page content drawing does not mutate `displaysAnnotations` or another shared `PDFPage` property. Visible annotations are drawn from `PDFPage.annotations` after the theme.
- Compatibility drawing is unchanged when no native theme lease exists, including after a native view releases its lease on capability fallback.
- The compatibility renderer remains available for all existing fallback capabilities.

## Tests

- All four page themes keep the iOS native viewer eligible.
- Android native eligibility is unchanged.
- The native page theme delegate is installed and retained on its `PDFDocument` before page access.
- Native theme drawing uses `pageRef`/`transform:forBox:` and does not mutate `displaysAnnotations`; visible annotations are drawn after themed content.
- Theme lease acquire/update/release is token-scoped, including two leases on one document and release of a stale token.
- Theme updates invalidate native page views without replacing the document.
- Compatibility rendering still owns its existing Core Image theme path when the native theme lease is absent.
- Papel Amassado defaults to `initialPageTheme: "normal"` and keeps `initialUITheme: "dark"`.
- Theme switching preserves current page, zoom, search/active result, selection, annotations and PencilKit; rotation 0→90→0 remains correct.
- A capability fallback releases the native theme lease before compatibility rendering starts.

## iOS smoke gate

Validate on an iOS simulator/device after a native build: switch all four themes while preserving current page and zoom; select text; use Define/Annotate; search and navigate among highlights; view and edit Papyrus annotations; use PencilKit; then switch to a capability that forces compat and confirm its themes still work. Confirm Papyrus annotation colors, search highlights, selection, and ink colors are not transformed by page themes.

## Out of scope

- Changing reader chrome theme defaults.
- Removing compatibility theme rendering or Android behavior.
- PDF serialization/export or permanent page rasterization.
- Changing selection, search, annotations, or PencilKit contracts.
- TestFlight or package publication as part of implementation.
