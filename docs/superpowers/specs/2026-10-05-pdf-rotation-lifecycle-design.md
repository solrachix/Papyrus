# PDF rotation lifecycle design

## Goal

Prevent compatibility rendering from leaving temporary page rotations in the shared `PDFDocument`, so switching between the compatibility renderer and the native iOS `PDFView` preserves the source PDF orientation. Provide an explicit way to reset viewer rotation and prevent one document's transient page, zoom, or rotation state from carrying into another load on the same engine.

## Current behavior

- `PapyrusPageView` renders a page through a `PDFView` and assigns `page.rotation = rotation` on the `PDFPage` obtained from the shared document.
- That assignment changes the shared PDF page. Renderer teardown or a switch back to the native viewer does not currently restore the page's source rotation.
- `NativeDocumentEngine.load()` resets `currentPage` to 1 but keeps the previous `zoom` and `rotation` values.
- `SettingsSheet` offers clockwise and counterclockwise rotation but no direct reset action.
- The native PDF viewer is eligible only at zero viewer rotation and normal page theme. Non-normal themes continue using the compatibility renderer.

## Design

### Track source rotation and apply a temporary effective rotation

Keep a per-document registry of source rotations for pages that `PapyrusPageView` changes. Key it by the actual `PDFDocument` object identity, not by `engineId`; one engine can load a different document. Capture a page's original rotation once, before the first temporary change. Every compatibility render applies:

```text
effectiveRotation = normalize(originalPageRotation + viewerRotation)
```

Use a shared Objective-C helper in the existing native engine module so both the compatibility page renderer and native document viewer can use the same registry. Each rendered page view owns a lease identified by a registry generation and a unique token. Multiple views of the same document page share one source-rotation record and hold separate leases; releasing one view must not restore the page while another lease is active. Restoring a specific page view restores the page it currently owns when it changes page/document and when it is deallocated, once its final lease is released.

Before the native `PDFView` attaches a document, restore and clear every registered page rotation for that document, then advance the registry generation. Leases from older generations become invalid. A delayed `dealloc` from an old compatibility view must be a no-op after this full restore; it must never apply a stale saved rotation. If a still-mounted compatibility view renders again, it obtains a lease in the current generation. This covers pages that were previously rendered and virtualized out of the compatibility view.

The registry is temporary rendering state only. It does not update Papyrus annotations or write to the PDF file. Page rotations already present in the source document remain intact after restoring viewer rotation to zero.

### Reset engine state on document load

After a successful document load, reset `NativeDocumentEngine` transient values to page 1, zoom 1, and rotation 0. The document-owning integration must initialize the viewer store for each new document before rendering it. `initializeStore(config)` already starts from fresh viewer defaults and then applies any explicit `initialPage`, `initialZoom`, or `initialRotation` from that document's config; preserve that behavior and add a regression test showing a second initialization clears prior document state. `NativeDocumentEngine.load()` does not mutate the separate viewer store.

### Add an explicit rotation reset control

Add a localized `Original / 0°` action alongside the existing clockwise and counterclockwise controls. It resets the engine rotation and writes rotation 0 to the viewer store. Existing direction actions remain unchanged.

### Preserve themed compatibility rendering

Do not add page-theme rendering to `PDFView`. `normal` continues using the native viewer when other capabilities allow it. Sepia, dark, and high-contrast themes continue using the compatibility renderer. The rotation restoration mechanism ensures returning from that renderer to the native viewer does not inherit a temporary page mutation.

## Failure handling and lifecycle

- A missing page or document makes restoration a no-op.
- Registry access and page rotation changes occur on the native UI thread, consistent with view rendering.
- Repeated restore calls are idempotent.
- Loading a different document cannot reuse rotation records from the prior document.
- A stale lease released after full-document restore cannot mutate the restored page.
- Releasing one of multiple leases for the same page cannot restore it while another view still owns it.

## Tests

Add focused contract/helper coverage for:

- viewer rotation 0 → 90 → 0 restores the page's source rotation;
- 0 → 90 → 180 → 270 → 0 restores the source rotation;
- source rotation 90 plus viewer rotation 90 yields effective rotation 180, and reset returns to source rotation 90;
- changing page/document and deallocating a page view restore the page it owned;
- two page views sharing one page restore only after the final lease is released;
- switching from themed compatibility rendering to native rendering restores every touched page before attachment;
- loading another document resets engine page, zoom, and rotation, and initializing the store for that document clears prior document state before applying explicit initial values;
- the reset action sets engine and store rotation to zero and has English and Portuguese labels.

No iOS build is claimed in the Linux environment. Runtime validation remains an iOS device/simulator smoke test, especially theme → original round-trip and PDFs whose source pages have non-zero rotations.

## Out of scope

- Rendering sepia, dark, or high-contrast themes inside `PDFView`.
- Enabling non-zero rotation in the native viewer.
- Persisting user rotation into the source PDF.
- Changing Android or other document formats.
- Generating an iOS build, EAS build, TestFlight upload, or npm release.
