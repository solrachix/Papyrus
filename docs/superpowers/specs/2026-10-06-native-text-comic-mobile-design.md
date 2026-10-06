# Native Mobile TXT and Comic Readers

## Goal

Route mobile TXT, CBZ, and CBR documents through native text and archive readers on iOS and Android while preserving PDF's existing native path, EPUB's WebView path, and every web engine.

## Current state

- `DocumentType` already models `pdf | epub | text | comic`; `ComicFormat` models `cbz | cbr`.
- `MobileDocumentEngine` selects the PDFium/PDFKit engine only for PDF and sends every other type to `WebViewDocumentEngine`.
- `Viewer` chooses between WebView, the native PDF view, and the compatibility renderer from `RenderTargetType` and PDF-specific capabilities.
- `engine-text` is a web-oriented paged text engine using UTF-8 decoding and fixed 1,600-character chunks.
- `engine-comic-core` owns web archive entry filtering, natural sorting, and page URL caches. The current mobile comic renderer remains in the WebView runtime; CBR additionally uses optional `libarchive.js` worker/WASM assets.
- `engine-native` currently registers PDF engines and PDF view managers only. Its podspec targets iOS 13 and its Android Gradle config keeps minSdk 21.
- Current `SearchResult` and reader store navigation assume page-based positions; stable text offsets/ranges are not represented yet.

## Architecture

### Routing and ownership

`MobileDocumentEngine` owns native PDF, native text, native comic, and existing WebView engines. It selects by explicit/inferred document type and comic format. Native text/comic expose a native render-target kind and native engine ID; the UI shell chooses a dedicated native surface without learning archive details. EPUB remains the WebView engine. Web `TextEngine`, `CBZEngine`, `CBREngine`, `engine-comic-core`, and their runtimes remain unchanged.

### Text model and rendering

- Canonical text positions are UTF-16 offsets and `[start,end)` ranges. This is stable across Java `String`, `NSString`, and JavaScript and independent of layout.
- The shared contract is `TextLocation { offset }`, `TextRange { start, end }`, text-only engine methods `getTextLength()`, `getCurrentTextOffset()`, and `goToTextOffset(offset)`, `TextSearchResult { location: { kind: "textRange", start, end }, excerpt, matchIndex }`, and a new selection event `{ text, start, end }`. Existing page-based `SearchResult` and `TEXT_SELECTED { text, pageIndex }` stay unchanged for PDF and other consumers. `currentTextOffset/textLength` drive text progress; `currentPage/pageCount` remain untouched for paged formats. Search-result navigation changes the active range and emits a text-offset scroll signal.
- Each document uses one selectable native text surface (`UITextView`/TextKit on iOS and a selectable Android `TextView` with `PrecomputedText` when available). This preserves continuous system selection, Copy, Define, and global UTF-16 ranges across the whole document. File reading, decoding, range mapping, and search happen off the UI thread; only the finished document text and compact search ranges are applied to the view. Layout updates preserve offset.
- BOM-aware decoding handles UTF-8, UTF-8 BOM, UTF-16 LE, and UTF-16 BE. Invalid encoded input produces a surfaced load error; there is no silent replacement-character fallback.
- Store state carries character offset and total UTF-16 length. Search results carry text ranges. Font, line-height, margins, and theme updates re-layout the view while preserving offset.
- Text selection uses the platform selection UI and reports ranges to the Papyrus store. Define/annotate callbacks use the shared shell contracts.
- Search matching is case- and accent-insensitive and collapses whitespace like the current search service. A mapping from each normalized UTF-16 unit back to its original source range is retained, including combining sequences, astral characters, and collapsed whitespace, so results always select the original text correctly after layout changes.
- There is no WebView size fallback for TXT. The native text surface owns the complete decoded string to preserve system selection across the document; decoding and search run off the UI thread and TextKit/PrecomputedText minimize layout work. A deterministic 8 MiB fixture and generated 32 MiB/64 MiB synthetic files are used to measure open, search, scroll, and peak memory on representative devices; this is a known memory risk until those measurements exist.

### Comic archive and rendering

- A shared native archive interface lists page metadata and extracts a requested page to a cache file, rather than passing compressed or decoded page bytes over the React Native bridge.
- Pin upstream libarchive release `v3.8.9` at signed commit `27cbc7827172698143e440801fc0ba39ccb4f1f5` under `packages/engine-native/vendor/libarchive/`. Compile a read-only subset for ZIP, RAR, and RAR5, with only the needed codecs and dependencies. Commit generated platform config headers and the exact compiled source list so CocoaPods and CMake builds are offline/reproducible. Extend the podspec to compile the vendored C sources; add a `papyrus_archive` CMake target linked by the Android JNI bridge. The Objective-C module and JNI methods expose metadata/page-cache paths, never image buffers over the React Native bridge. Include upstream and per-file license notices for every compiled file.
- Supported input is unencrypted, readable ZIP/CBZ and the tested RAR4/RAR5 subset, including solid archives if a legal fixture demonstrates it. Encrypted entries and unsupported RAR variants fail with an explicit error. The project does not claim support for every RAR feature. Validate the exact format matrix against deterministic copyright-free fixtures before enabling CBR routing.
- The archive layer filters hidden/metadata/non-image entries, rejects entries above 64 MiB uncompressed, rejects source dimensions above 20,000 pixels on an edge or 80 megapixels total, and applies the same natural order semantics as `engine-comic-core`. Native ImageIO/BitmapFactory downsampling caps viewer rasters at 8 megapixels and thumbnails at 1,024 pixels per edge. The disk cache is capped at 96 MiB; the decoded bitmap LRU has a 64 MiB budget and only the current page plus one neighbor can be resident at full viewer resolution.
- The comic surface is a registered native view: `UICollectionView`/`UIImageView` on iOS and `RecyclerView` on Android. A shared native page provider controls archive extraction, image downsampling, and decoded bitmap eviction instead of delegating full-resolution decode to React Native `Image`. It supports single/continuous layout, fit width/page, LTR/RTL, progress, restore, thumbnail previews, pinch zoom, and pan. A platform bitmap LRU enforces the 64 MiB decoded budget (current + one adjacent page); the 96 MiB disk cache bounds extracted rasters.
- Comic progress persists the logical zero-based page index. RTL changes presentation and next/previous semantics, never the stored page index.

### Source lifecycle and failure behavior

- Android `content://` URIs are opened through `ContentResolver` and staged to a private cache file when native random access needs a path. iOS file URLs are read under security-scoped access where available and copied to app cache when access cannot be retained.
- `MobileDocumentEngine` owns the PDF, native text, native comic, and WebView adapters. `load()` increments a generation synchronously, invalidates/closes the active adapter before asynchronous source normalization, then selects the new adapter. Every adapter/native store receives `{ engineId, generation }`; results must match the current generation before being adopted. Stale native results close their document/store and delete only that generation's staged source and cache. Destroy/detach and failed loads invalidate the generation. Tests cover text A→comic B, comic A→EPUB B, same-engine text A→text B, destroy during load, and late completion; an old A can never replace B.
- The WebView fallback remains only when the corresponding native manager is unavailable in the installed app. TXT/comic load failures surface on the selected native route and do not silently switch parsers after load begins, avoiding a second parser racing the active generation.
- Empty, corrupt, unsupported, encrypted/limited RAR, inaccessible URI, and decode errors reject with clear errors. PDF and EPUB routes are unchanged.

## Archive library decision

Use upstream libarchive rather than RARLab UnRAR-derived libraries because it has a permissive BSD-style distribution and a single read-only backend for ZIP, classic RAR, and RAR5 on both platforms. Pin the signed v3.8.9 commit `27cbc7827172698143e440801fc0ba39ccb4f1f5`. Upstream documents limitations for RAR variants and an Android build path covering API 21 and `arm64-v8a`; therefore the implementation advertises only the tested unencrypted subset. Preserve the root and per-file notices and audit every compiled source. No iOS or Android minimum target is raised. RAR coverage, binary delta, and device memory require real builds/fixtures; Linux CI cannot substitute for `xcodebuild`.


## Non-goals

- No changes to web TXT/CBZ/CBR, WebView runtime behavior, EPUB, or PDF behavior.
- No annotations on comic pages and no freehand drawing/PencilKit port to comics.
- No archive writing, encrypted archive support promise, OCR, or PDF export.
- No npm publication, EAS/TestFlight build, store release, or merge in this change.

## Validation

Test route selection, encoding and original UTF-16 range mapping (accents, combining marks, surrogate pairs, collapsed whitespace, repeated hits), source replacement/generation races, archive filtering/order/empty/corrupt errors, page extraction and bounded cache, oversize-entry/dimension rejection, progress/restore, LTR/RTL, and the existing web/PDF/EPUB route contracts. Run focused and package suites, TypeScript package builds, ESLint, available Gradle tests/builds, and `git diff --check`. Report iOS build/device smoke as pending if `xcodebuild` and devices are unavailable. Measure 8 MiB TXT load/search/scroll and large-CBZ first-page, page-switch latency, peak memory, cache residency, and binary delta on representative hardware before making performance claims.
