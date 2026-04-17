# Papyrus Mobile Reading UX Refinement

## Summary

Refine the Papyrus mobile reading experience for PDF, EPUB, and TXT so it feels cleaner, lighter, and more premium while preserving all existing capabilities.

This spec is intentionally `mobile-only`.

- Web is out of scope for this cycle.
- Existing Web UX may remain on the prior model.
- The goal is not to replicate Apple Preview literally, but to absorb its clarity, hierarchy, floating surfaces, and content-first behavior.

This spec treats:

- `Apple Preview` as a UX benchmark for visual hierarchy and contextual chrome
- `PDFKit on iOS` as a benchmark for PDF interaction quality
- `Papyrus` as the owner of the cross-platform shell, state, and capability model

## Goals

- Preserve all existing mobile reader capabilities.
- Reorganize controls without removing functionality.
- Restore a bottom floating dock as a primary mobile navigation layer.
- Reduce permanent chrome and increase contextual UI.
- Make PDF, EPUB, and TXT feel related but not identical.
- Keep the resulting experience implementable in React Native on iOS and Android.

## Non-Goals

- Redesigning Web in this cycle.
- Removing or downgrading existing capabilities.
- Forcing PDFKit-like implementation details onto Android or non-PDF formats.
- Rebuilding every mobile subsystem at once.
- Introducing mobile shell/state changes that alter Web behavior during this cycle.

## Product Principles

- `Reading first`: document content remains the dominant surface.
- `Context over permanence`: controls appear because the user needs them, not because they exist.
- `Preserve capability`: if a feature moves, it must reappear in a clearer place.
- `Format-aware UX`: PDF is page-first, EPUB is section-first, TXT is progress-first.
- `Premium, not ornamental`: translucency, floating surfaces, and motion must support usability.
- `Mobile ergonomics`: thumb-reachable actions matter more than desktop-style control density.

## 1. Diagnosis Of The Current Mobile Experience

Papyrus mobile already supports strong functionality:

- reading across PDF, EPUB, and TXT
- page navigation and jump-to-page
- search and result navigation
- thumbnails and outline
- notes and annotations
- appearance and page-theme controls
- transition mode, layout, rotate, zoom, and locale
- document info and document actions

The main weakness is not missing functionality. It is `experience composition`.

Current mobile UX behavior is split across:

- a topbar that still carries too much ongoing responsibility
- a `RightSheet` that acts as a generic utility host
- a settings surface that is useful but not clearly separated from document utilities
- recent shell changes that removed the old bottom navigation bar without replacing it with an equally strong ergonomic layer

The result is a mobile reader that is capable, but not yet calm or well-prioritized.

## 2. Main Problems

### 2.1 The header still does too much

The header currently mixes:

- identity
- page status
- page-step navigation
- overflow/settings entry

That makes it harder to keep the top chrome minimal.

### 2.2 The app lost a strong thumb-driven primary navigation layer

The old bottom bar was not visually premium, but it solved a real problem:

- fast access to read/search/pages/notes

Removing that without a replacement weakened the mobile flow.

### 2.3 `RightSheet` is overloaded

`RightSheet` currently blends:

- pages
- thumbnails
- outline
- search
- notes

It works technically, but it behaves like a multi-purpose panel rather than a family of dedicated contextual sheets.

### 2.4 Search is functional but not elegant

Search currently behaves more like a panel feature than a lightweight mobile interaction. It needs:

- a cleaner entry point
- better current-result / total-result feedback
- stronger coexistence with the keyboard

### 2.5 Page/progress is not treated as a primary reading affordance

Location is important in all formats, but it is still too tied to header logic instead of being a distinct mobile affordance.

### 2.6 PDF, EPUB, and TXT still share too much shell behavior

The formats should not expose the same defaults:

- PDF wants page + thumbnail + zoom emphasis
- EPUB wants section + chapter progress + contents emphasis
- TXT wants minimal progress + search + appearance emphasis

## 3. What Should Remain As-Is

These pieces are structurally good and should survive:

- `SettingsSheet` as a dedicated surface for reading and display preferences
- `InfoSheet` as a dedicated metadata surface
- `DocumentActionsSheet` as a dedicated document-action surface
- `ToolDock` and `AnnotationEditor` as annotation-focused surfaces
- jump-to-page as a short modal flow
- thumbnails, outline, and notes as existing capabilities
- search services and result-navigation infrastructure

The refinement should reorganize these surfaces, not replace them wholesale.

## 4. What Should Return To The Older Model

### 4.1 Clear separation between settings and utilities

Papyrus should explicitly separate:

1. `Display Settings`
2. `Document Utilities`
3. `Navigation`

This was handled more intuitively in the older model than in the current shell direction.

### 4.2 A bottom navigation layer

A bottom bar should return, but not as a rigid legacy bar.

It should return as a `floating bottom dock`.

### 4.3 Easy access to reading preferences

The following must remain easy to find and should continue to live inside `Display Settings`, not get absorbed into other menus:

- appearance
- page theme
- PDF canvas/background controls
- transition
- layout
- rotate
- zoom
- language

## 5. What Should Change

- The header becomes lighter and more selective.
- Page/progress gets its own floating affordance.
- Search becomes a two-level flow: quick input first, full results second.
- Pages, notes, info, actions, and settings become distinct destinations rather than competing inside one generic panel model.
- The bottom floating dock becomes the main ergonomic access point.
- Format-specific behavior becomes explicit in the shell.

## 6. New Mobile UX Architecture

Papyrus mobile should adopt the following layer model:

- `Layer 0: Content Stage`
- `Layer 1: Floating Header`
- `Layer 2: Progress / Location Pill`
- `Layer 3: Floating Bottom Dock`
- `Layer 4: Context Overlays`
- `Layer 5: Modal Sheets`

### Layer 0: Content Stage

Always dominant.

### Layer 1: Floating Header

Minimal, high-confidence actions only.

### Layer 2: Progress / Location Pill

A compact floating pill that exposes current page, chapter, or progress and opens navigation.

### Layer 3: Floating Bottom Dock

The main thumb-driven navigation layer.

### Layer 4: Context Overlays

Examples:

- quick search input
- temporary search navigation bar
- annotation contextual controls

### Layer 5: Modal Sheets

Examples:

- Pages
- Search results
- Notes
- Display Settings
- Document Info
- Document Actions

## 7. Header Proposal

### Always visible

- `Back/Close` when provided by the host app
- truncated title
- `More` button

### Visible only in some contexts

- annotation/session indicators
- temporary status related to selection or tool mode
- optional page-step controls in very specific contexts only

### Should leave the header

- primary navigation to pages/search/notes
- full settings access as a permanent top-level burden
- always-visible previous/next page buttons

### Header behavior

- visible on open
- visible after a tap
- visible on reverse scroll or direct interaction
- collapses during uninterrupted reading
- remains visually light and single-row

### Critical recommendation

Permanent previous/next page buttons in the header should not be the default mobile pattern.

They may exist:

- in a specific PDF mode
- in landscape when space permits
- in temporary controls-visible state

But they should not define the main reading shell.

## 8. Floating Bottom Dock Proposal

The bottom dock should return as the main ergonomic control surface.

### Base structure

- slot 1: `Navigate`
- slot 2: `Search`
- slot 3: `Notes` or `Annotate`
- slot 4: `More`

### Recommended per format

#### PDF

- `Pages`
- `Search`
- `Annotate`
- `More`

Constraint:

- `Notes` must remain one tap away from the primary PDF shell.
- Recommended rule: PDF exposes `Notes` from both `Annotate` mode and as a first-level destination inside `More`.

#### EPUB

- `Contents`
- `Search`
- `Notes`
- `More`

#### TXT

- `Progress`
- `Search`
- `Display`
- `More`

### Dock behavior

- floats above safe area
- hides with keyboard open
- hides during long uninterrupted reading
- reappears on tap, reverse scroll, or explicit mode entry
- can morph in annotation mode to expose annotation-specific controls

### What should not happen

- the dock should not try to expose every capability directly
- it should not become a dense toolbar
- it should not duplicate full settings when `More` or `Display` already route there
- `More` must not become a catch-all replacement for primary navigation; `Pages/Contents`, `Search`, and `Notes/Annotate` must stay outside `More`

### Dock fallback rule

If a preferred dock destination is not supported for the active format or engine, the slot must fall back to the nearest preserved capability rather than becoming empty.

Recommended precedence:

- slot 1: `Pages` -> `Contents` -> `Progress`
- slot 3: `Annotate` -> `Notes` -> `Display`
- slot 4 remains `More`

## 9. Search Proposal

Search should become a two-layer mobile flow.

### First layer: Search overlay

On activating `Search` from the dock:

- show a floating search bar above the keyboard
- focus immediately
- display:
  - query input
  - current result index
  - total results
  - previous and next result actions

### Second layer: Search results sheet

Open only when the user requests all results, or when a dense result list is useful.

### By format

#### PDF

- show page reference and text snippet

#### EPUB

- show chapter/section reference and snippet

#### TXT

- show snippet and relative progress

### Search rules

- closing the results sheet does not have to clear the search
- closing the keyboard should not immediately destroy the search session
- search must remain lightweight in the primary reading flow

## 10. Page / Progress / Navigation Proposal

Current location should be promoted into a `floating progress pill`.

### Pill display by format

#### PDF

- `12 / 248`

#### EPUB

- `Chapter 4 · 37%`

#### TXT

- `62%`

### On tap

#### PDF

Open `Pages Sheet`:

- entry to `jump-to-page`
- thumbnails
- outline

#### EPUB

Open `Contents Sheet`:

- sections / chapters
- outline
- progress within chapter
- entry to location jump when supported

#### TXT

Open `Progress Sheet`:

- simple progress control
- logical markers if available

### Jump-to-page / jump-to-location rule

`Jump-to-page` remains a preserved short modal flow.

- In PDF, the `Pages Sheet` is the discovery surface and launches the compact jump modal.
- In EPUB/TXT, the equivalent sheet may launch a compact location jump where the format supports it.
- The sheet does not replace the short jump flow; it hosts entry into it.

### Recommendation

The location affordance should be more persistent than page-step buttons, and lighter than a fixed panel.

### Discrete next/previous navigation preservation

If Papyrus currently exposes button-based next/previous navigation in paged contexts, that capability must remain.

Recommended placement:

- inside temporary `controls-visible` state
- inside `Pages Sheet` / `Contents Sheet`
- optionally in landscape or explicit paged mode controls

It should not remain a permanent default burden in the header.

## 11. Settings Menu Proposal

The current `SettingsSheet` concept should remain.

It should become the dedicated `Display Settings Sheet`.

### It should contain

- appearance
- page theme
- PDF background/canvas options
- page transition
- layout
- rotate
- zoom
- language

### It should not absorb

- search
- notes
- document info
- document actions
- pages

### Access

From:

- header overflow
- dock `More`
- dock `Display` for TXT and possibly EPUB

## 12. Proposal For Document Info / Document Actions / Notes / Pages

### Document Info

Dedicated sheet for:

- title
- format
- source/origin
- size
- page or chapter count

### Document Actions

Dedicated sheet for:

- share
- export
- open/reveal origin
- document operations supported by capability

### Notes

Dedicated sheet for:

- notes list
- replies
- jump to note target

This should no longer need to be framed as just one tab inside a generic panel.

### Pages

Dedicated navigation sheet.

#### PDF

- thumbnails first
- outline also available

#### EPUB

- contents/outline first
- thumbnails secondary and capability-gated

Rule:

- if EPUB thumbnails exist today for a given engine/runtime, they remain accessible from the navigation sheet rather than disappearing
- if an engine/runtime does not support meaningful EPUB thumbnails, the UI may omit them without implying regression

#### TXT

- no page thumbnail metaphor by default

Rule:

- if TXT has no meaningful thumbnail model, it should not invent one
- if any existing TXT navigation affordance is currently exposed, it must reappear through progress/location UI rather than be silently removed

## 13. Feature Preservation Map

### Maintained

- appearance light/dark
- page theme
- PDF background/canvas controls
- page transition
- layout
- rotate
- zoom
- language
- notes
- document info
- document actions
- pages
- search
- page jump
- next/previous navigation where currently supported
- thumbnails
- outline
- annotations

### Relocated

- `Search`: from generic tab/panel to search overlay + results sheet
- `Pages`: from generic utility tab to dedicated navigation sheet
- `Notes`: from generic utility tab to dedicated notes sheet
- `Location`: from header burden to progress/location pill
- `Display Settings`: kept as a dedicated settings sheet accessed from overflow/dock
- `Info` and `Actions`: kept separate, not merged into settings

### Hidden capabilities that must remain easy to find

- page theme
- PDF background/canvas
- transition
- layout
- rotate
- zoom
- language

### New additions

- floating bottom dock
- floating progress/location pill
- quick search overlay
- clearer separation of `Display`, `Document`, and `Navigate`

### Must remain inside the old settings model

- appearance
- page theme
- PDF background/canvas
- transition
- layout
- rotate
- zoom
- language

## 14. PDF vs EPUB vs TXT UX Differences

### PDF

- `page-first`
- stronger page jump
- stronger thumbnails
- stronger zoom relevance
- stronger annotation relevance

### EPUB

- `section-first`
- stronger contents/outline
- stronger chapter progress
- stronger typography and reading-theme relevance

### TXT

- `progress-first`
- minimal shell
- no heavy page metaphors by default
- emphasize readability, search, and display controls

## 15. Visual, Motion, And Behavioral Direction

### Visual

- soft floating surfaces
- high legibility
- reduced visual framing
- strong spacing over dividers
- premium but restrained translucency

### Motion

- short fade + translate for header and dock re-entry
- calm sheet presentation
- quick keyboard-coupled search transition
- no decorative motion that delays reading

### Behavior

- chrome fades during reading
- annotate mode suspends aggressive hiding where necessary
- keyboard simplifies the shell instead of colliding with it
- iOS can adopt higher-fidelity PDF behavior where PDFKit enables it, but the user-facing shell remains Papyrus-owned

### Surface precedence

When multiple transient surfaces compete, Papyrus mobile should resolve them in this order:

1. system keyboard and active text input
2. search overlay
3. annotation contextual controls
4. progress/location pill
5. floating bottom dock

Implications:

- opening the keyboard hides the dock
- active search suppresses the progress pill where overlap would occur
- annotate controls may temporarily replace or compress the dock
- the header remains independently recoverable and should not fight these lower surfaces

## 16. Practical Implementation Plan

### Phase 1: Re-center the mobile shell

- freeze Web UX changes for this cycle
- restore bottom navigation as a floating dock
- reduce the header to back/title/more
- introduce the progress/location pill

### Phase 2: Separate destination surfaces

- split `RightSheet` responsibilities into dedicated destination sheets
- keep `RightSheet` as infrastructure, not as product architecture

### Phase 3: Search refinement

- add search overlay
- add current/total result controls
- keep full result list in dedicated sheet

### Phase 4: Format-aware polish

- PDF pages sheet
- EPUB contents sheet
- TXT progress sheet

### Phase 5: Annotation and premium interaction polish

- make dock adapt in annotate mode
- improve contextual affordances around note creation and selection

## Architecture Guidance

- `Apple Preview` is a quality benchmark, not a pixel blueprint.
- `PDFKit` is an iOS PDF benchmark and implementation reference, not a shell architecture.
- Android and cross-platform React Native execution remain Papyrus-owned.
- The correct move is not to remove capability. It is to redistribute capability into clearer mobile destinations.

## Final Recommendation

The strongest direction for Papyrus mobile is:

- keep the settings model
- restore a bottom floating dock
- make location/progress a first-class floating affordance
- stop overloading the header
- stop treating `RightSheet` as the center of the mobile product
- make PDF, EPUB, and TXT visibly different in navigation semantics

This direction preserves the full feature set, improves discoverability, and creates a cleaner, more premium mobile reading shell without demanding unrealistic architectural changes.
