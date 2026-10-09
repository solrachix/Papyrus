# Comic reader stability implementation plan

**Goal:** Stable native comic scrolling, useful page navigation and accurate reader controls.
**Architecture:** iOS owns viewport position; observed page changes never issue navigation. Keep page dimensions outside the evictable bitmap cache and preserve a page-relative viewport anchor through layout changes. The app restores native comics once and uses the existing lazy preview grid. Store remains source of truth. Ink/OCR are excluded.
**Tech stack:** Objective-C/UIKit, React Native/TypeScript, Vitest/Jest, local Android example.

## SDK
- [x] Add failing contracts in `packages/engine-native/nativeMobileManagers.contract.test.ts` for observational page changes, midpoint, unchanged viewport/setters and cache-independent sizes.
- [x] Fix `packages/engine-native/ios/PapyrusComicDocumentView.m`: `_currentPage` on scroll; viewport midpoint once; guarded setters; page-relative anchor around dimension/viewport changes; dimension registry cleared on document change; explicit navigation only after layout.
- [x] Add failing tests in `bottomBarModel.test.ts`, hide search for comic in `bottomBarModel.ts`; use page count label in `ProgressPill.tsx`; align Topbar title with a centered hit area and no text flex stretching.
- [x] Run focused Vitest, SDK builds, changed TS/TSX lint, diff-check and Android example with real CBR.

## Consumer
- [x] Add regressions in `readingThumbnailModel.test.ts`, `readingNavigation.test.ts`, `ebook.service.test.ts`.
- [x] Allow native comic previews and catch preview failures in `ReadingRightSheet.tsx`.
- [x] Add helpers in `readingNavigation.ts`: comic pages destination, native-comic single restoration. Wire both restore effects in `reading.tsx`; keep existing PDF workaround.
- [x] Resolve useful picker name from file URI before generic fallback; humanize legacy generated titles without exposing timestamps.
- [x] Run focused Jest, changed-file ESLint and diff-check. Keep changes in separate repository worktrees; do not publish packages, OTA or store builds.

## Native validation limit
Linux cannot compile UIKit. iOS xcodebuild and iPhone slow/fast scroll, resize, cache eviction, RTL, zoom and restoration remain release gates. Android baseline uses the user's 70-page CBR; do not claim iOS runtime proof from that test.

## Validation evidence
- SDK: 43 focused tests (including Objective-C source contracts); engine-native and ui-react-native builds; both CJS/ESM preserve all three native ink worklets; changed TypeScript lint and diff-check.
- App: 36 focused tests (including real sheet rendering, preview rejection and page tap); changed-file ESLint has zero errors and ten existing warnings; diff-check.
- Broader app checks: ReadingRightSheet's existing `numColumns` assertion fails equally on HEAD (one failure, two passes). Typecheck reports two unchanged ReviewSharePreview promise-result errors (lines 186/193); no comic reader errors.
- Android example: configured Reanimated 3.19.5 + Babel plugin + manual native registration, since beta.8 requires it; local x86_64 assembleDebug succeeded (33 seconds).
- Fixture: user's As Amazonas 03 CBR, 70 images, roughly 46 MiB; archive integrity verified. Pixel emulator only.
- No package version bump, npm publication, OTA, EAS, TestFlight or store submission.

Android smoke after patch: opened the real CBR, slow scroll changed 4/70 to 5/70, fast scroll reached 10/70; search action absent. Large fit-page blank areas remain visible in the Android example and are not claimed resolved by the iOS anchor fix. App grid was validated behaviorally in Jest, not on an iPhone.
