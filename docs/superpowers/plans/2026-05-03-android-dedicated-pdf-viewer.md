# Android Dedicated PDF Viewer Plan

## Context

The current Android PDF path renders one React Native page component per PDF page. Zoom is coordinated through React Native `ScrollView`/`FlatList`, page layout recalculation, and native `PapyrusPageView` rendering. Even after improving anchor math, global horizontal scroll, native render caching, and direct zoom updates, a visible glitch remains when the committed zoom changes the actual page layout.

This indicates the problem is architectural: React Native layout, native PDF rendering, and scroll compensation are fighting each other during zoom. Android needs a dedicated PDF viewport where pan, zoom, visible-page calculation, render scheduling, and drawing live in one native view.

## Goal

Build an Android-native dedicated PDF viewer for Papyrus PDF rendering while preserving the public React Native SDK API.

The dedicated viewer must:

- Own PDF pan and zoom natively.
- Avoid React Native relayout during pinch.
- Render only visible pages.
- Cache rendered bitmaps.
- Cancel stale renders.
- Preserve page, zoom, annotation, search, and selection integration points.
- Keep EPUB/TXT and non-Android platforms on the current implementation until equivalent dedicated paths exist.

## Non-Goals

- Do not rewrite EPUB/TXT.
- Do not rewrite iOS in the first implementation.
- Do not remove the existing React Native page renderer until the dedicated viewer reaches parity.
- Do not change the public SDK API.
- Do not ship a partially equivalent renderer without a feature flag.

## Architecture

### Native Android Layer

Add a new native view:

- `PapyrusPdfViewerView.java`
- `PapyrusPdfViewerViewManager.java`
- Optional pure helpers:
  - `PapyrusPdfViewport.java`
  - `PapyrusPdfPageLayout.java`
  - `PapyrusPdfRenderCache.java`
  - `PapyrusPdfRenderScheduler.java`
  - `PapyrusPdfCoordinateMapper.java`

The view receives an existing `engineId` and reads the loaded `PdfDocument` from `PapyrusEngineStore`.

### React Native Layer

Add a wrapper:

- `DedicatedPdfViewer.tsx`

`Viewer.tsx` chooses the renderer:

- Android + native PDF + feature flag enabled: `DedicatedPdfViewer`
- Everything else: current implementation

Feature flag options:

- prop: `viewerProps.useDedicatedAndroidPdfViewer`
- env/dev fallback if needed

### Event Boundary

Native emits events:

- `onPageChanged`
- `onZoomChanged`
- `onTapAnnotation`
- `onSelectionChanged`
- `onRenderStats`
- `onLoadError`

React Native keeps owning:

- topbar/bottom bar/tool dock
- annotation editor sheets
- global store
- document loading orchestration
- non-PDF document rendering

## Native View State

`PapyrusPdfViewerView` owns:

- `engineId`
- `pageTheme`
- `currentPage`
- `zoom`
- `minZoom`
- `maxZoom`
- `offsetX`
- `offsetY`
- `viewportWidth`
- `viewportHeight`
- `contentWidth`
- `contentHeight`
- page layouts
- visible page list
- render cache
- render generation token

React Native may update props, but gestures should mutate native viewport state directly.

## Gesture Model

Use native Android gesture handling:

- `ScaleGestureDetector` for pinch.
- `GestureDetector` or direct `onTouchEvent` for pan/fling/tap.
- `OverScroller` for inertial scroll.

Pinch behavior:

- Capture focal point in view coordinates.
- Map focal point to document coordinates before scale changes.
- Apply scale natively.
- Recompute content size.
- Adjust offsets so the same document coordinate remains under the focal point.
- Clamp offsets.
- Invalidate view.
- Emit throttled `onZoomChanged`.

This removes the React Native relayout cycle during pinch.

## Page Layout

Initial scope:

- continuous vertical mode only.

Native layout rules:

- page size comes from PDFium page dimensions.
- base scale fits page width into viewport minus horizontal padding.
- rendered page rect = page dimensions * effective scale.
- vertical positions are cumulative with spacing.
- when content width is smaller than viewport, center horizontally.
- offsets clamp to content bounds.

Later:

- single-page mode.
- double-page mode.
- RTL/two-page cover rules if needed.

## Rendering

### MVP Rendering

Render visible full pages as bitmaps:

- Determine visible pages from `offsetY`, viewport height, and page layout.
- For each visible page, compute render size.
- Use a scale bucket for cache keys.
- Render off the UI thread.
- Draw ready bitmaps in `onDraw`.
- Draw placeholder/page background while a bitmap is pending.

### Render Cache

LRU cache key:

- document identity/source
- page index
- render width
- render height
- scale bucket
- rotation
- theme

Cache requirements:

- shared per process.
- bounded memory.
- evict/recycle safely.
- never draw recycled bitmaps.

### Render Cancellation

Use a generation token:

- increment when document, zoom bucket, page theme, or viewport changes.
- render jobs include the generation they started with.
- stale jobs discard results.
- UI thread only accepts the newest generation for the page/key.

### Future Tile Rendering

If full-page bitmaps are not enough:

- split visible pages into tiles.
- prioritize tiles near viewport center.
- cache tile bitmaps.
- draw low-res page preview while high-res tiles load.

Do not start with tiles unless profiling proves full-page visible rendering is insufficient.

## Annotations

Keep existing normalized annotation data:

- page index
- normalized rects/path
- type/color/opacity/stroke width

Native coordinate mapping:

- screen -> document
- document -> page
- page -> normalized
- normalized -> page rect
- page rect -> screen

MVP:

- draw highlight/underline/squiggly/strikeout/comment markers natively.
- emit tap events for comments/annotations.
- keep editor UI in React Native.

Later:

- native ink drawing path capture.
- drag/resize annotations if required.

## Search

MVP:

- React Native store continues to hold search results.
- Pass active search rects to native.
- Native draws search highlights using normalized/page rect coordinates.
- React Native controls query UI.

Later:

- Native can own search result navigation if needed.

## Text Selection

Selection is the riskiest parity area.

MVP options:

- Keep current page renderer as fallback when selection tool is active.
- Or implement rectangle selection natively using existing `PapyrusTextSelect`.

Target mature behavior:

- drag selection in native view.
- map selection rect to page coordinates.
- call PDFium/native selection helper.
- emit `TextSelection` to React Native.
- React Native opens action/editor UI.

Do not block the first dedicated viewer MVP on perfect text selection unless selection is mandatory for release.

## React Native Integration Steps

1. Add native Android view manager and JS wrapper.
2. Add feature flag to `ViewerProps`.
3. Detect Android + PDF native engine.
4. Render `DedicatedPdfViewer` behind the flag.
5. Wire native events to `useViewerStore`.
6. Keep current renderer as fallback.
7. Add development toggle in mobile example only if useful.

## Implementation Order

### Milestone 1: Native View Skeleton

- Create `PapyrusPdfViewerView`.
- Create manager.
- Register props:
  - `engineId`
  - `pageTheme`
  - `initialPage`
  - `initialZoom`
- Draw static page backgrounds and page numbers/debug outlines.
- Emit basic render stats.

Verification:

- Android compiles.
- App installs.
- Native view appears behind feature flag.

### Milestone 2: Native Viewport

- Implement page layout.
- Implement offset clamp.
- Implement pan.
- Implement pinch focal zoom.
- Implement current page calculation.
- Emit page/zoom changes.

Verification:

- Unit tests for viewport math.
- Manual Android pan/pinch without React Native relayout.

### Milestone 3: PDF Rendering

- Render visible pages with PDFium.
- Add render scheduler.
- Add cache.
- Add stale render cancellation.
- Draw cached bitmaps.
- Draw placeholders while rendering.

Verification:

- Unit tests for cache key and visible page selection.
- Android unit tests for render math.
- Device test with bundled PDF.
- Logcat has no native crash.

### Milestone 4: SDK Store Wiring

- Sync `currentPage`.
- Sync `zoom`.
- Sync theme.
- Support programmatic `goToPage`.
- Support `scrollToPageSignal`.

Verification:

- Existing RN tests updated for renderer selection.
- Manual page jump works.

### Milestone 5: Annotations And Search

- Draw annotation overlays natively.
- Hit-test annotations.
- Draw search highlights.
- Emit annotation tap events.

Verification:

- Coordinate mapping tests.
- Manual annotation/search checks.

### Milestone 6: Selection Parity

- Implement native text selection or fallback strategy.
- Emit `TextSelection`.
- Preserve selection UI behavior.

Verification:

- Selection tests where possible.
- Manual selection checks.

### Milestone 7: Default Enablement

- Compare dedicated vs existing renderer.
- Fix parity gaps.
- Turn feature flag on for Android PDF.
- Keep escape hatch for one release.

## Test Plan

### Java Unit Tests

- viewport clamp.
- focal zoom.
- page layout.
- visible page range.
- cache key.
- coordinate mapping.
- render size limits.

### JS Unit Tests

- renderer selection.
- event-to-store mapping.
- feature flag fallback.
- page/zoom event handling.

### Builds

- `pnpm --filter @papyrus-sdk/ui-react-native build`
- `pnpm --filter @papyrus-sdk/engine-native build`
- `pnpm test:phase1`
- `pnpm lint:phase1`
- `examples/mobile/android/gradlew :papyrus_engine_native:testDebugUnitTest`
- `examples/mobile/android/gradlew :app:installDebug`

### Device Checks

- launch app.
- load bundled PDF.
- pinch in/out repeatedly.
- pan during zoom.
- zoom out below page width and verify centering.
- page jump.
- rotate if supported.
- annotation tap/edit.
- search highlight.
- selection.
- inspect logcat for:
  - `FATAL EXCEPTION`
  - `OutOfMemoryError`
  - bitmap recycled draw errors
  - PDFium render errors

## Risks

- PDFium access is synchronized; careless render parallelism can crash.
- Large pages at high zoom can exceed bitmap memory.
- Search/selection parity may take longer than viewport/rendering.
- React Native store and native viewport can drift if events are too noisy.
- iOS behavior will remain different until a separate dedicated path exists.

## Success Criteria

- Android PDF pinch does not relayout React Native pages during gesture.
- No visible committed-zoom glitch.
- Scroll/zoom feel native.
- Render keeps up with viewport using cache/placeholders.
- No crashes in repeated pinch/scroll device sessions.
- Existing SDK UI still works.
- EPUB/TXT behavior unchanged.
- Current renderer remains available as fallback until the dedicated path is proven.
