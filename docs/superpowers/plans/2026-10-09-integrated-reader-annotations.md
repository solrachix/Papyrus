# Integrated reader annotations implementation plan

**Goal:** Deliver contextual annotations across PDF, EPUB and native TXT, plus stable comic reading, as one SDK/app release.
**Architecture:** Preserve Annotation IDs and legacy data. Add optional versioned content anchors, markupStyle and noteContent; store owns mutations. Native spans/PDFAnnotations and epub.js decorations represent store state only. Local snapshots persist immediately; server revision/CAS rejects stale destructive replacement; conflicts preserve canonical state and pending local work.
**Tech stack:** TypeScript/Zustand, epub.js/WebView, UIKit, Android spans, React Native/Reanimated, Express/PostgreSQL, Vitest/Jest.

## Chunk 1 — Shared contracts
- [ ] Add union anchors (PDF geometry, EPUB CFI/href, TXT UTF16 range), quote/context and note/style fields in types.
- [ ] Add core validation, legacy adapters, unique contextual range recovery, mutation helpers and navigation contracts.
- [ ] Write behavioral tests first: Unicode, invalid/ambiguous anchors, scoped identity, same ID note+markup, old records.

## Chunk 2 — Native comics and TXT
- [ ] Defer decoded image layout changes until drag/deceleration finishes; preserve logical page/fraction anchor; explicit navigation remains immediate.
- [ ] Add TXT annotation props/events, attributed ranges/spans independent of search, native actions and hit targets; React Native only emits/store mutates.
- [ ] Test helpers and contracts; compile Android debug; iOS compile/smoke is required but pending if no macOS access.

## Chunk 3 — EPUB
- [ ] Capture selection CFI, chapter and text/context; validated/session-scoped messages.
- [ ] Reconcile markup/notes by stable ID, grouping epub.js CFIs where necessary; implement true strikeout decoration.
- [ ] Reflow-safe note markers in content; controlled unique recovery; navigation to range, no rebuild of the book.
- [ ] Test capture, reflow/rehydration, duplicate ranges, unsafe messages, stale results and note tap.

## Chunk 4 — Notes UI and PDF
- [ ] Shared contextual quick view/editor with multiline note, quote, color and style, accessible safe-area/keyboard/reduced motion.
- [ ] Preserve PDF/PencilKit and extend comment render to mark quote and indicator; update/delete through store.
- [ ] List navigates precise anchors, free notes never invent location; fix affected preexisting Notes test.

## Chunk 5 — App persistence/API
- [ ] Add immediate local checkpoint and offline hydration for synchronized snapshots.
- [ ] Add server revision/CAS and conservative conflict handling; maintain account+book_file scope and existing free notes.
- [ ] Test retry, stale snapshots, deletion resurrection, two devices, account switch and revision mismatch.
- [ ] Include schema migration and validation without applying production migrations.

## Chunk 6 — Integration gates
- [ ] Verify current bases, preserve PencilKit/import fixes; prepare compatible package versions and consumer lockfiles.
- [ ] Expanded SDK/app/API tests, lint, builds, Worklets, diff-check; classify baseline failures.
- [ ] Pixel smoke PDF/EPUB/TXT/CBR + synthetic 20/100-page comics and real 70-page CBR; iOS gate documented separately.
- [ ] Review diffs, commit/push and linked PRs. No merge/npm/OTA/production build authorized.
