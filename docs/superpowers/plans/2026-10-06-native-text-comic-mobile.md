# Native TXT and Comic Mobile Readers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native mobile TXT, CBZ, and CBR readers on iOS and Android without changing PDF, EPUB, or web behavior.

**Architecture:** Extend mobile routing with native text/comic engine targets. Use one selectable TextKit/UITextView and Android TextView/PrecomputedText surface per text document with UTF-16 offset state; use libarchive v3.8.9 at `27cbc7827172698143e440801fc0ba39ccb4f1f5` as a common native ZIP/RAR archive service. Comics use registered `UICollectionView`/`UIImageView` and `RecyclerView` page providers with explicit downsampling and bitmap LRU ownership. WebView fallback is only for apps where a native view manager is unavailable; EPUB and all web renderers remain unchanged.

**Tech Stack:** TypeScript, React Native, Objective-C/UIKit/TextKit, Kotlin/Java, C++/CMake/libarchive, CocoaPods, Jest/Vitest, Gradle.

---

## File map

### Contracts/store

- Modify `packages/types/index.ts`: render targets, text offsets/ranges, separate `TextSearchResult`, text selection event, source progress, comic presentation settings, optional text-range annotation data. Keep the existing PDF `SearchResult` and `TEXT_SELECTED` payload stable.
- Modify `packages/core/store.ts` and add focused core tests: persist and navigate text offsets/comic page position without using visual coordinates; add `currentTextOffset`, `textLength`, and `scrollToTextOffsetSignal` while leaving page progress intact for page-based formats.
- Add a text-specific core search path and tests: preserve `[start,end)` UTF-16 ranges into original source text, including normalized accents, combining sequences, surrogate pairs, and collapsed whitespace, without changing PDF search.

### Native engine package

- Modify `packages/engine-native/index.ts`, `documentType.ts`, package metadata, and public tests: add native text/comic engine adapters, manager detection, source generations, and native target IDs. `MobileDocumentEngine.load()` increments its generation before any async normalization, closes/invalidate the active adapter, checks generation before adoption, and closes/deletes stale resources.
- Create `packages/engine-native/nativeTextModel.ts` and tests for BOM/encoding, UTF-16 offsets, search ranges, progress, and restore helpers.
- Create `packages/engine-native/nativeComicModel.ts` and tests for valid image entries, natural sort, direction mapping, and cache policy.
- Modify `packages/engine-native/ios/PapyrusNativeEngine.m`; create `PapyrusTextDocumentView.{h,m}`, its manager, and native text/archive helpers.
- Modify Android engine module/store/package/view registration; create selectable text view/manager and archive/page-provider implementation.
- Modify `packages/engine-native/android/src/main/cpp/CMakeLists.txt` and iOS podspec; vendor libarchive `v3.8.9` at `27cbc7827172698143e440801fc0ba39ccb4f1f5` plus per-file license notices. Keep generated build config and exact source list; compile only required ZIP/RAR readers/codecs. Archive cache rejects >64 MiB entries and images above 80 MP or 20,000 px edge; thumbnail output max edge is 1,024 px, disk cache cap 96 MiB/five neighbor pages.
- Native TXT has no WebView size fallback and uses one full-document selectable view so system selection crosses every line; decode/search stay off the UI thread. Measure 8 MiB, 32 MiB, and 64 MiB fixtures on device because the native text control owns the full decoded string. Comic `PapyrusComicDocumentView` owns ImageIO/BitmapFactory decode and LRU: viewer raster ≤8 MP, thumbnail edge ≤1,024 px, decoded bitmap LRU ≤64 MiB with at most current + one neighbor at full resolution; archive cache remains ≤96 MiB/five pages.

### React Native shell

- Modify `packages/ui-react-native/components/Viewer.tsx` and `ReadingShell.tsx`: select dedicated text/comic surfaces from render-target capability.
- Create `NativeTextDocumentViewer.tsx` and `NativeComicDocumentViewer.tsx`.
- Modify `ProgressPill.tsx`, `SearchOverlay.tsx`, `SearchResultsSheet.tsx`, `RightSheet.tsx`, and `SettingsSheet.tsx` for offset-based text progress/search and comic mode/fit/direction/thumbs.
- Modify `mobileStrings.ts` and tests for comic controls and native selection actions.
- Add focused route/viewer/store/engine tests; keep WebView route assertions for EPUB and web engines.

## Chunk 1: Native reader contracts and route tests

- [ ] Add failing tests for `text -> native-text`, `comic/cbz -> native-comic`, `comic/cbr -> native-comic`, `epub -> webview`, `pdf -> current native PDF`.
- [ ] Run the focused route tests and confirm failures are specifically due to missing native engine target/selection.
- [ ] Add text offset/range and comic page progress contracts and focused store tests.
- [ ] Add native route helper and test generation invalidation before asynchronous source resolution.
- [ ] Implement only enough engine/store routing to make those tests pass.
- [ ] Run focused tests, then commit the contract slice.

## Chunk 2: Native text model and iOS reader

- [ ] Add failing tests for UTF-8 BOM, UTF-16 LE/BE, invalid byte sequences, UTF-16 range indexing, source-offset remapping after case/accent/whitespace normalization, search, restore, and progress.
- [ ] Run tests and confirm expected failures.
- [ ] Implement pure TypeScript model helpers and wire native text engine adapter with a separate text-search and range-selection contract.
- [ ] Add one iOS TextKit-backed `UITextView` with async source decode, continuous selection events carrying `{text,start,end}`, native menu actions, search spans, theme/typography, and offset restoration.
- [ ] Add iOS contract tests for registered view props/events and stale source generations.
- [ ] Run focused tests/builds available on Linux; record iOS compilation as pending.
- [ ] Commit the iOS text slice.

## Chunk 3: Android native text reader

- [ ] Add failing Android tests for selectable TextView, BOM decoding, search spans, range/offset restoration, stale loads, and theme/font relayout.
- [ ] Confirm red, implement the native selectable `TextView` with background decode/search and `PrecomputedText` where supported.
- [ ] Add custom selection actions and JS/native event wiring.
- [ ] Run Gradle unit tests and Android library build where available, plus package tests.
- [ ] Commit the Android text slice.

## Chunk 4: Shared native archive service

- [ ] Add failing host/native tests for entry filtering, hidden paths, metadata, natural ordering, empty/corrupt archives, image types, and stable page metadata.
- [ ] Confirm red and add a deterministic copyright-free CBZ fixture plus a generated legal RAR fixture if reproducible.
- [ ] Vendor the libarchive `v3.8.9` read subset from `27cbc7827172698143e440801fc0ba39ccb4f1f5` and per-file license notices; generate deterministic fixtures for ZIP/CBZ and legal RAR4/RAR5 cases; add common C++ archive abstraction for list/page extraction/cancel/close.
- [ ] Add iOS and Android source staging and archive store bindings without base64 image transfer.
- [ ] Add page cache size/eviction tests, oversized-entry/dimension rejection, encrypted/unsupported RAR error, solid archive fixture if legal/reproducible, and source replacement tests.
- [ ] Run host CMake tests and Android native tests; note real iOS build requirement.
- [ ] Commit the archive backend.

## Chunk 5: Native comic engine and surface

- [ ] Add failing tests for native comic routing, progress restore, page cache/thumbnail APIs, single/continuous, LTR/RTL index mapping, and source replacement.
- [ ] Confirm red; implement `NativeComicDocumentEngine` using the native archive API and file-URI page results.
- [ ] Implement registered `PapyrusComicDocumentView` (`UICollectionView` on iOS, `RecyclerView` on Android) backed by native downsampling and an enforced 64 MiB decoded bitmap LRU; support single/continuous modes, fit modes, LTR/RTL, pinch/pan, and bounded neighbor preload.
- [ ] Wire thumbnail previews into `RightSheet`, including thumbnail-size extraction.
- [ ] Run focused React Native tests, package builds, and ESLint.
- [ ] Commit the comic reader slice.

## Chunk 6: Shell integration, fallback, and full validation

- [ ] Add failing Viewer/Shell contracts that assert native text/comic do not mount WebView, EPUB still does, and PDF remains on the existing native/compat route.
- [ ] Confirm red and wire the reader shell, offset-based progress/search result navigation, comic settings, and selection/annotation range callbacks.
- [ ] Verify unavailable native managers use the existing controlled compatibility route and native load errors remain visible.
- [ ] Run focused tests, package suites, TypeScript builds, ESLint, `git diff --check`, available CMake/Gradle tests and Android build.
- [ ] Review final changed-file scope and ensure web runtimes and unrelated branches are untouched.
- [ ] Commit the integration and prepare one PR; do not merge, publish npm, build EAS/TestFlight, or release.

## Open platform validation

- [ ] On macOS: `xcodebuild` build for iOS device and supported simulator architectures; validate iOS 13 compile availability.
- [ ] On device/emulator: TXT selection/search/Define/annotate/encoding/large-file scroll; CBZ and RAR4/RAR5 open/page extraction/cache/RTL/pinch/rotation/background; `content://` and `file://` source changes.
- [ ] Measure first-page latency, cache residency, app binary delta, and peak memory on a large comic and TXT fixture before describing performance as validated.
