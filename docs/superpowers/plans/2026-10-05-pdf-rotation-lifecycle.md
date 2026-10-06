# PDF rotation lifecycle implementation plan

> **For agentic workers:** Use this plan as the execution checklist. Keep the implementation in the existing dedicated worktree and preserve unrelated changes.

**Goal:** Restore source PDF page rotations across compat/native viewer transitions, reset per-document engine state, and provide an explicit localized rotation reset action.

**Architecture:** Add a shared Objective-C per-document page-rotation registry with generation-scoped leases, used by `PapyrusPageView` and restored before `PapyrusPdfDocumentView` attaches a document. Reset `NativeDocumentEngine` transient state after successful load. Add a small tested settings action helper and localized iOS-only reset label; preserve compat themes and all Android behavior.

**Tech Stack:** Objective-C, PDFKit, TypeScript, Zustand, Vitest, React Native.

---

## Files

- Create `packages/engine-native/ios/PapyrusPageRotationRegistry.h/.m` for source rotation capture, effective rotation, leases, and restore-all.
- Modify `packages/engine-native/ios/PapyrusPageView.h/.m` to own/release a lease on page/document change and deallocation.
- Modify `packages/engine-native/ios/PapyrusPdfDocumentView.m` to restore registered source rotations before PDFKit attaches/reuses a document.
- Create `packages/engine-native/PapyrusPageRotation.contract.test.ts` for registry lifecycle and integration ordering.
- Modify `packages/engine-native/index.ts` and `packages/engine-native/runtimeSource.test.ts` to reset and verify page/zoom/rotation after successful load.
- Modify `packages/core/store.phase1-shell.test.ts` to verify reinitializing for a second document clears prior state and honors explicit initial values.
- Create `packages/ui-react-native/components/rotationReset.ts/.test.ts` for the explicit engine rotation reset action.
- Modify `packages/ui-react-native/components/SettingsSheet.tsx`, `mobileStrings.ts`, and `mobileStrings.test.ts` for the new reset control and EN/PT-BR labels.

## Chunk 1: Restore temporary PDF page rotations

- [x] Add contract tests for source + viewer rotation, page/document switch, deallocation, restore-all generation invalidation, concurrent leases for one page, and native-view attachment ordering.
- [x] Run the focused registry contract test and confirm it fails on the missing helper/behavior.
- [x] Implement the Objective-C registry and integrate it with `PapyrusPageView` and `PapyrusPdfDocumentView`.
- [x] Run the focused contract test and existing native PDF view contract tests.

## Chunk 2: Reset document-scoped engine and store state

- [x] Add a runtime test that loads a PDF, changes page/zoom/rotation, then successfully loads another PDF and expects page 1, zoom 1, rotation 0.
- [x] Run the focused runtime test and confirm it fails because `load()` retains zoom/rotation.
- [x] Reset engine transient values only after successful load.
- [x] Add a store test for second `initializeStore()` clearing prior state while honoring the new document's explicit initial values.
- [x] Run the engine and store tests.

## Chunk 3: Add localized explicit rotation reset

- [x] Add tests for resetting 90°, 180°, and 270° through clockwise engine turns and preserving 0°; assert the reset callback writes store rotation 0 and the SettingsSheet control invokes the helper.
- [x] Run the focused rotation reset test and confirm it fails before implementation.
- [x] Implement the helper and wire it to a localized iOS-only “Original / 0°” SettingsSheet action that sets store rotation to 0.
- [x] Add EN/PT-BR string assertions and run focused SettingsSheet/string tests.

## Final verification

- [x] Run focused core, engine-native, and UI React Native tests.
- [x] Build `@papyrus-sdk/engine-native` and `@papyrus-sdk/ui-react-native`.
- [x] Run ESLint on changed TypeScript files and `git diff --check`.
- [x] Inspect the final diff for Android/compat scope and confirm no app build, iOS build, TestFlight, or package publication occurred.

The Linux environment cannot run `xcodebuild`; report iOS compilation and device smoke as pending.
