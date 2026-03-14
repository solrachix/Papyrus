# Mobile PDF Gestures Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate mobile PDF interactions to a gesture-driven path that fixes pinch zoom and prevents selection from fighting viewer scroll while supporting edge auto-scroll during drag.

**Architecture:** Move PDF pinch, double-tap, and drag selection off `PanResponder` into `react-native-gesture-handler`, while coordinating vertical viewer scroll and horizontal page scroll through explicit selection-drag state. Keep zoom/render math and selection geometry in small helper modules with direct tests.

**Tech Stack:** React Native, react-native-gesture-handler, Zustand store, tsup, node:test, Android build verification

---

## Chunk 1: Testable Interaction Helpers

**Files:**
- Modify: `packages/ui-react-native/gesture/pinchZoom.test.mjs`
- Create: `packages/ui-react-native/gesture/selectionInteraction.ts`
- Create: `packages/ui-react-native/gesture/selectionInteraction.test.mjs`

- [ ] Write failing tests for viewer scroll lock and edge auto-scroll decisions.
- [ ] Run the targeted node tests and verify they fail for the missing helper.
- [ ] Implement the minimal helper module for edge thresholds, autoscroll deltas, and viewer-scroll locking.
- [ ] Run the targeted node tests and verify they pass.

## Chunk 2: Gesture-Handler Migration

**Files:**
- Modify: `packages/ui-react-native/components/PageRenderer.tsx`
- Modify: `packages/ui-react-native/package.json`
- Modify: `examples/mobile/package.json`
- Modify: `examples/mobile/index.js`
- Modify: `examples/mobile-expo/package.json`

- [ ] Add `react-native-gesture-handler` dependency declarations where needed.
- [ ] Replace the PDF `PanResponder` hot path with gesture-handler pinch, tap, and pan composition.
- [ ] Preserve existing selection behavior, ink behavior, and zoom button compatibility.
- [ ] Run package build and targeted tests.

## Chunk 3: Viewer Coordination And Docs

**Files:**
- Modify: `packages/ui-react-native/components/Viewer.tsx`
- Modify: `packages/ui-react-native/README.md`
- Optionally modify: `examples/mobile/App.tsx`

- [ ] Lock external viewer scroll while selection drag is active.
- [ ] Add vertical and horizontal edge auto-scroll coordination while the finger remains pressed.
- [ ] Document that host apps must install `react-native-gesture-handler` and wrap the root with `GestureHandlerRootView`.
- [ ] Run `pnpm --filter @papyrus-sdk/ui-react-native build`, targeted node tests, and Android `:app:assembleDebug` verification.
