# Papyrus Shared EPUB Reader Chrome Design

**Status:** Design approved; written-spec review pending.

## Goal

Give Papyrus and Readium EPUB reading on iOS the same mature Papel Amassado reader interface by sharing Papyrus UI presentation components while keeping each engine's state and actions in its own adapter.

## Context

The app currently renders `UnifiedEpubReaderChrome` for iOS EPUBs. It duplicates the header, bottom controls, settings modal, and contents list instead of using the established Papyrus components. Those SDK components currently read `useViewerStore()` and, in several cases, call `DocumentEngine` directly. The app-specific `ReaderEngineAdapter` already maps Papyrus and Readium state into a common snapshot, but its UI lives in the app and has a separate visual implementation.

This design extracts controlled visual components from the existing Papyrus UI. It does not put Readium inside Papyrus or make Readium impersonate a Papyrus `DocumentEngine`.

## Chosen approach

Add engine-neutral, controlled presentation components to `@papyrus-sdk/ui-react-native`. Keep the existing public `Topbar`, `BottomBar`, `SettingsSheet`, and `RightSheet` APIs as Papyrus-backed wrappers. Those wrappers and the app's Readium path will render the same presentation components, with state and callbacks supplied by their respective adapters.

The app retains its `ReaderEngineAdapter` as the integration boundary. It translates Papyrus or Readium snapshots and commands into props for the shared SDK components. The SDK presentation layer receives display values, capability flags, and callbacks; it does not read `useViewerStore()`, instantiate an engine, or own reading progress.

### Shared presentation units

- **Header:** title, back/settings actions, visibility, theme, accent, and layout inputs. The existing Papyrus wrapper continues to provide Papyrus navigation and settings behavior.
- **Bottom controls and progress:** the Papyrus visual arrangement and spacing are reused. Controls are shown or disabled from the selected engine's capabilities. Progress changes are sent through adapter callbacks; the component does not translate between Papyrus CFIs and Readium locators.
- **Settings sheet:** one visual sheet for theme, font size, and contents entry. The adapter supplies the options supported by its engine. Papyrus retains its existing options, including high contrast where supported; Readium does not display unsupported options.
- **Contents sheet/list:** one shared sheet and hierarchical list presentation. Papyrus retains its existing outline behavior; Readium supplies its flattened table of contents and its own selection callback.

The shared components are controlled views: values arrive as props and interactions call callbacks. Papyrus-specific data and actions remain in the existing wrappers. The Readium UI never renders annotation, freehand ink, or ToolDock actions until a Readium implementation exists.

## User-visible behavior

- Switching between Papyrus and Readium changes EPUB rendering and engine-specific capabilities, not the header, control styling, settings-sheet layout, or contents-sheet presentation.
- Papyrus behavior outside the iOS EPUB route remains unchanged.
- Controls whose capability is absent are hidden or disabled consistently; no control is presented as working when its engine action is unavailable.
- Existing modal-dismiss sequencing is preserved: opening search or contents from settings occurs only after the settings modal has dismissed.
- Each engine continues to store its own reading position. Switching engines does not convert or overwrite CFIs and Readium locators.
- Annotation and freehand tools remain Papyrus-only in this phase. Sharing their appearance alone must not imply Readium support.

## Compatibility and boundaries

- Preserve the existing exported Papyrus component names, props, and behavior for current SDK consumers.
- Add new documented exports for the controlled presentation API; do not require a fake or nullable `DocumentEngine` in that API.
- Keep the app adapter contract app-owned unless an SDK-level type proves necessary for the controlled component props. The SDK should not depend on Papel Amassado-specific storage, navigation, analytics, or modal policies.
- Limit app migration to iOS EPUB rendering. Android EPUB and non-EPUB formats continue through their current paths.
- Do not change Readium native code, add native dependencies, implement Readium annotations, or alter cross-engine progress synchronization.
- Do not publish an npm package or OTA as part of this implementation phase. Package release and OTA remain separate actions after review and runtime compatibility checks.

## Failure and capability handling

The adapter remains responsible for engine readiness, fallback, and mapping commands. The shared views render the latest snapshot and disable actions while the engine is not ready or an action is unavailable. A missing TOC produces the existing empty state or removes the entry point according to the current component contract; it must not create a dead modal. Papyrus continues to use its current error and loading behavior.

## Verification and acceptance criteria

1. Papyrus-backed legacy components keep their current public API and existing behavior on non-iOS-EPUB routes.
2. Papyrus and Readium iOS EPUB routes render the same shared header, bottom-control, settings, and contents presentation components.
3. Adapter tests verify navigation, theme/font updates, TOC selection, readiness/disabled states, and capability-gated controls without asserting engine internals.
4. Component tests cover the shared views and Papyrus wrappers, including high-contrast availability and modal dismissal sequencing.
5. SDK package build and type checks pass; mobile type checking and focused reader tests pass.
6. A TestFlight smoke check remains required for visual layout, safe-area spacing, navigation gestures, modal transitions, and Papyrus ToolDock interaction before any OTA is considered. Automated tests do not establish WKWebView or native interaction behavior.
7. The implementation changes JavaScript/TypeScript only. It is an OTA candidate only for a compatible installed runtime, after the app's OTA policy checks; this design does not claim publication or device application.

## Test focus

SDK tests should verify controlled props produce the expected shared visuals and callbacks, while wrapper tests ensure Papyrus state is mapped into those props without changing legacy actions. Mobile tests should verify each adapter's snapshot-to-props mapping, capability gating, theme and font actions, TOC destination selection, and modal transitions. Keep tests focused on observable contracts rather than component implementation details.
