# Mobile Performance Plan (ui-react-native)

Goal: bring the web performance improvements (virtualization stability, faster thumbnails, smoother jumps) to the React Native viewer.

## 1) Audit & baselines
- Map render flow in `packages/ui-react-native/components/Viewer.tsx` + `PageRenderer.tsx`.
- Measure baseline on a large PDF (1k+ pages):
  - initial load time
  - scroll FPS / dropped frames
  - memory during scroll + thumbnails open
- Identify current hot paths (frequent re-render props, `setDocumentState` bursts).

## 2) Viewer list tuning (FlatList)
- Add `windowSize`, `maxToRenderPerBatch`, `updateCellsBatchingPeriod`.
- Enable `removeClippedSubviews`.
- Provide `getItemLayout` using cached page sizes:
  - cache `engine.getPageDimensions(pageIndex)` in store or local map.
  - use estimated height fallback before cache.
- Add “page jump” reliability:
  - if `scrollToIndex` fails, compute `scrollToOffset` with cached height.
  - set `currentPage` immediately on jump, then let `onViewableItemsChanged` settle it.

## 3) Page rendering stability
- Memoize `PageRenderer` with `React.memo`.
- Avoid recreating props (e.g. stable callbacks via `useCallback`).
- Reduce re-renders on scroll (avoid setting state per-frame).

## 4) Thumbnails (RightSheet)
- Limit initial render: `initialNumToRender`, `windowSize`.
- Use `onViewableItemsChanged` to render thumbs only when visible.
- Add placeholder fallback when not visible.
- Cache thumbnail dimensions per page.

## 5) Current page stability (hysteresis)
- Add hysteresis logic for `currentPage` updates:
  - switch only if next page is > X% visible.
  - avoids flicker between pages.

## 6) Config flags
- Expose optional props to tune performance:
  - `virtualWindowSize`
  - `maxToRenderPerBatch`
  - `removeClippedSubviews`
  - `thumbsInitialCount`
- Document defaults + recommended settings for large docs.

## 7) Test matrix
- Devices: mid Android (4GB), iPhone 11+.
- PDFs: 50 pages / 500 pages / 1500 pages.
- Scenarios: open, scroll, jump to page, open thumbnails, search result jump, theme changes in runtime (UI theme, page theme, accent, surface/border/text/canvas tokens).

## 8) Documentation
- Update native docs with tuning flags.
- Add “Performance tips (mobile)” section.
- Add “Large files (EPUB/PDF)” troubleshooting section:
  - avoid converting large local files to base64 on RN bridge (OOM risk)
  - prefer URI-based load with runtime-side fetch/ArrayBuffer path
  - document fallback strategy, timeout knobs, and expected memory behavior on mid-tier devices
- Status: done in `packages/ui-react-native/README.md`, `docs/mobile.md`, and `docs/MOBILE.pt-BR.md`.

## 9) Annotation parity (web → native)
- Extend native annotation model usage to support:
  - text marks: highlight, underline, squiggly, strikeout (`rects`)
  - freehand (ink) with `path`
- Add native tool dock + color picker for annotation color.
- Implement selection menu for text tools (select → action menu).
- Render overlay layers for:
  - highlight/underline/squiggly/strikeout using rects
  - ink paths as SVG or canvas overlay
- Ensure annotations serialize/restore correctly.
- Status: implemented in `packages/ui-react-native/components/PageRenderer.tsx`, `packages/ui-react-native/components/ToolDock.tsx`, and `packages/ui-react-native/strings.ts`.

## 10) Mobile UX baseline parity (web → native)
- Header:
  - left: thumbnails toggle + pencil button (annotation dock toggle)
  - center: page controls centered
  - right: search button next to `...` overflow
- Keep long branding hidden on small screens to preserve title/control space.
- Mobile chrome behavior:
  - hide header + bottom bar while scrolling down through pages
  - show header + bottom bar when user scrolls up with hysteresis threshold
- `...` quick-actions modal:
  - zoom controls (`-`, `%`, `+`)
  - page theme buttons
  - UI theme toggle with icon
  - upload action with icon
  - do not duplicate search action if search is already in header
  - keep modal open after theme changes
- Side sheets/panels should open as overlay (must not push page render area).
- Viewer should support pinch-to-zoom (two-finger gesture) on touch screens.
- Pending: two-finger zoom still needs fix on native PDF pages; currently it works in WebView modes (EPUB/TXT) but not reliably in PDF.
- Annotation dock should start closed by default and open only on explicit user action.
- Close nested popovers (e.g. color picker) when annotation dock closes.
- Ensure quick-actions modal/bottom sheet is above annotation dock (z-index/layer priority).

## 11) Theme token propagation parity (web lesson)
- Ensure theme overrides are applied at each native surface root, not only on a parent wrapper:
  - header/topbar
  - viewer canvas container
  - left sheet/panel
  - right sheet/panel
- Add explicit `themeOverrides` support on `PapyrusViewer` native entry and forward to internal components.
- Resolve each token with fallback defaults per theme mode (light/dark) instead of hard overriding internal values.
- Add a runtime validation checklist in demo:
  - changing `surface` updates topbar and sheets immediately
  - changing `border` updates panel and control borders
  - changing `text`/`textMuted` updates labels and secondary text
  - changing `canvas` updates viewer background
- Document this behavior in native docs/examples to avoid regressions on future refactors.
