# Integrated reader validation progress — 2026-10-09

## Recovered source

The transient worktrees disappeared after an environment restart. The source edits were recovered from the session's edit commands into permanent dedicated worktrees under `/home/carlos/projects/thoth`. Current verification was repeated; previous logs/counts are not treated as current evidence.

## Current evidence

- SDK: 471 tests / 83 files pass.
- Native Android: 48 tests / 9 suites pass; development APK assembleDebug succeeds.
- types/core/engine-native/ui-react-native package builds succeed. Ink Worklets check: 3 CJS + 3 ESM worklets serialize.
- App: 40 focused tests / 7 suites plus 3 ReadingRightSheet tests pass.
- API: 5 unit tests + 6 real PostgreSQL integration tests pass in a dedicated localhost test database. Production migrations were not applied.
- SDK lint passes. App/API lint reports 0 errors and 85 existing warnings. API typecheck passes; mobile typecheck retains the preexisting ReviewSharePreview.tsx ShareAction/ShareOpenResult errors.
- Pixel_7_API_35 / emulator-5556: development APK installed; real 70-page CBR loaded; continuous images fit without the former gaps in the observed pages. Zoom controls, a two-finger pinch, horizontal pan and vertical scroll were exercised. Pinch exposed stale-width prefetched cells; attachment now synchronizes geometry, and the repeated gesture/new-page scrolling no longer showed the blank lateral area in the observed pages.
- Static review also caught and fixed lost documentId forwarding to native PDF and the free-note ON CONFLICT target after the scoped migration. Both have regressions.

## Pending gates

- Complete Pixel PDF/EPUB/TXT annotation CRUD, rehydration and accessibility matrix; finish synthetic 20/100-page comic matrix.
- iOS xcodebuild plus physical-device PDF/TXT/EPUB/comic/PencilKit smoke.
- Regenerate the consumer Podfile.lock on macOS with the exact local native engine.
- Consumer source base has moved: origin/thoth-stack is 18 commits ahead of the saved integration HEAD. Synchronize and rerun consumer validation before release approval.
- Server revision enforcement returns 428 to old destructive PUT clients without a token. Do not deploy this API independently of the coordinated client rollout.

No npm publication, OTA, EAS, production/store build, store submission or PR merge was performed. Native changes require a new compatible binary; they cannot be delivered to old runtimes by OTA alone.

Local evidence (not committed copyrighted comic images): `/home/carlos/projects/thoth/reader-validation`.
