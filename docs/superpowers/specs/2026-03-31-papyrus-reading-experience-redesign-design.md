# Papyrus Reading Experience Redesign

## Summary

Redesign the Papyrus reading and annotation experience for PDF, EPUB, and TXT so the product feels lighter, more modern, and more content-first while remaining implementable across Web and React Native.

The redesign takes inspiration from the Preview reading experience in how it handles hierarchy, context, and visual weight. It also treats `PDFKit` as both a benchmark and a real execution surface for PDF on iOS, without letting that decision leak into the cross-platform shell architecture.

This spec defines:

- the end-state experience architecture for Papyrus reading surfaces;
- the first implementation slice that can ship before deeper geometry and annotation work;
- the enabling contracts needed to keep the redesign implementable across packages and engines.

Planning target:

- this document is approved as the design input for a `phase-1 implementation plan only`;
- later phases are directional and should be split into follow-on plans or specs rather than folded into the first execution plan.

## Problem

Papyrus already has strong reader capabilities across reading, search, outline, thumbnails, selection, annotations, notes, and navigation. The main weakness is not missing functionality. It is experience composition.

Today, the primary reading flow still feels too much like a tool surface:

- persistent sidebars and bars compete with the document;
- global and contextual actions sit at the same visual level;
- some flows open heavy panels when a lighter surface would be enough;
- platform shells are functionally capable but do not yet feel unified or premium;
- format differences exist technically, but the UX still leans too hard toward a generic document tool.

The result is a reader that is capable but visually dense. The redesign must improve the reading experience without forcing an unrealistic single-engine or single-platform implementation model.

## Goals

- Make the document the dominant surface on Web and React Native.
- Replace always-on chrome with contextual, intention-driven controls.
- Introduce a shared shell language across platforms using equivalent components rather than pixel-identical UI.
- Treat PDF, EPUB, and TXT as related but distinct reading experiences.
- Create a first slice that materially improves product perception without depending on the riskiest technical work.
- Define explicit state, location, capability, and geometry contracts so implementation can proceed without UX ambiguity.

## Non-Goals

- Cloning Preview visually.
- Requiring `PDFKit` outside iOS.
- Solving advanced document operations like rotate and reorder on every platform in the first slice.
- Replacing the entire Papyrus design system in this spec.
- Making all engines behave identically at the implementation level for zoom, scroll, gesture physics, or selection internals.

## Approaches Considered

### 1. UX-led spec with a technical appendix

Organize the document around principles, flows, and components, then append technical details later.

Pros:

- Easy for product and design alignment.
- Keeps the vision clear.

Cons:

- Risks separating critical technical constraints from the UX they enable.
- Makes implementation planning more ambiguous.

### 2. Architecture-led spec with a UX overlay

Organize the document around packages, state, geometry, capabilities, and engine boundaries, with UX implications described inside those sections.

Pros:

- Strong for engineering execution.

Cons:

- Makes the redesign feel like a refactor instead of a product experience change.
- Weakens the clarity of the end-state user experience.

### 3. Recommended: Experience slices with enabling architecture

Organize the spec around experience slices such as reading shell, search, jump, outline, and annotations. Each slice defines the UX goal, primary surfaces, state, capabilities, dependencies, and rollout implications.

Pros:

- Keeps product intent and technical execution connected.
- Makes it easier to map the spec to an implementation plan.
- Reduces the chance of visual redesign work drifting away from engine reality.

Cons:

- Requires editorial discipline to avoid repetition.

## Recommended Design

### Scope and intent

This is a hybrid spec. It defines the target Papyrus reading experience and also specifies the minimum technical contracts required to implement it safely.

The spec covers:

- end-state experience architecture;
- cross-platform shell behavior;
- format-specific UX expectations;
- enabling state, capability, location, and geometry contracts;
- first implementation slice and phased rollout.

The spec assumes controlled breaking changes in the next major version of the UI packages. Existing shell components such as topbars, sidebars, and bottom bars are no longer treated as the primary architecture of the reader experience.

### Objectives, non-objectives, and principles

The redesign is governed by these operating principles:

- `Reading first`: the document is the primary surface.
- `Context over permanence`: controls appear because the user expressed intent, not because they exist.
- `Format-aware by default`: PDF emphasizes pages, zoom, thumbnails, and annotations; EPUB emphasizes sections, progress, and typography; TXT emphasizes simplicity.
- `Cross-platform parity, not pixel parity`: the shell must behave equivalently across Web and React Native, while allowing platform-native implementations under the hood.
- `Capability-aware UX`: the shell only exposes flows that the active engine and document can support reliably.
- `Stable anchors before premium polish`: overlays that depend on geometry and selection must wait for trustworthy anchoring contracts.

### Experience architecture

Papyrus is redefined as a reading shell composed of primary surfaces and context overlays.

Primary surfaces:

- `Content Stage`: the document viewport and reading surface. Always dominant.
- `Floating Top Controls`: minimal global controls, title/context, location, and overflow entry.
- `Floating Bottom Dock`: ergonomic entry point for modes and quick actions, especially on mobile and tablet.
- `Sheets/Drawers`: secondary surfaces for search results, outline, thumbnails, comments, info, and document actions.

Context overlays:

- `Search Pill`
- `Page Jump Pill`
- `Compact Annotation Toolbar`
- `Section Navigator`
- transient highlight and confirmation overlays

Visibility contract:

- Always visible: document, discrete location/progress indicator, overflow access.
- Contextual: annotation toolbar, zoom controls, section navigation, selection actions.
- Hidden until intention: full search results, thumbnails, outline tree, detailed comments, full metadata.

Chrome behavior:

- the shell may enter `reading-dimmed`;
- controls may auto-hide when appropriate, but only under predictable rules;
- a tap or equivalent intent must restore controls without ambiguity;
- secondary surfaces must never displace the `Content Stage` as the default behavior on compact screens.

Platform interpretation:

- `Phone`: compact top controls, bottom dock, sidebars replaced by bottom sheets or overlays.
- `Tablet`: same shell language with optional semi-pinned contextual surface.
- `Web desktop`: floating islands plus a lighter utility panel instead of rigid bars and full-time sidebars.

### Platform and engine reality

The shell is shared, but engine execution remains platform-specific.

Current execution baseline:

- `Web PDF`: `@papyrus-sdk/engine-pdfjs`
- `Web EPUB`: `@papyrus-sdk/engine-epub`
- `Web TXT`: `@papyrus-sdk/engine-text`
- `iOS PDF`: `PDFKit` through `@papyrus-sdk/engine-native`
- `Android PDF`: `PDFium` through `@papyrus-sdk/engine-native`
- `Mobile EPUB/TXT`: WebView runtime

Implication:

`PDFKit` is both a benchmark and a real implementation for PDF on iOS, but it does not define the shell. The shell must depend on Papyrus-owned contracts so it remains coherent across Android, Web, EPUB, and TXT.

### Experience slices

#### Reading Shell

The default document-open experience should feel calm and content-first.

Behavior:

- open in a `focus` state;
- show `Floating Top Controls` in a minimal form;
- reserve `Floating Bottom Dock` for later phases unless a host application explicitly needs a platform-specific bridge affordance;
- allow transition into `reading-dimmed` after inactivity or continuous reading;
- restore controls on explicit interaction.

Primary states:

- `focus`
- `controlsVisible`
- `readingDimmed`
- `modalSurfaceOpen`
- `annotate`

Dependencies:

- reliable current location signal;
- surface visibility state;
- stable scroll/page/section change events.

#### Search

Search becomes a short-intention flow rather than a permanent utility panel.

Behavior:

- entry through `Search Pill` or equivalent;
- focus input immediately;
- open results in a sheet or light utility surface;
- navigate to a result and apply a temporary highlight;
- preserve query and active result while the search surface remains open.

States:

- `idle`
- `inputFocused`
- `searching`
- `results`
- `empty`
- `error`

Dependencies:

- existing search service;
- common result target contract across formats;
- temporary highlight behavior decoupled from the panel itself.

#### Page Jump / Position Jump

The current location affordance becomes the main short-form navigation entry point.

Behavior by format:

- `PDF`: show `current/total`, open compact numeric jump.
- `EPUB`: show section/progress, open jump by chapter or logical position.
- `TXT`: show logical progress and jump using the best available position model.

States:

- `closed`
- `editing`
- `submitting`
- `invalid`
- `navigated`

Dependency:

- a shared `DocumentLocation` contract that does not assume every format has absolute pages.

#### Outline / Section Navigation

Outline becomes a contextual reading aid rather than a structural sidebar.

Behavior:

- open via explicit user action;
- use a sheet on phone and a lighter contextual panel on tablet or desktop;
- support local filtering;
- close on selection by default on compact screens;
- treat EPUB destinations and sections as first-class navigation targets.

States:

- `closed`
- `loading`
- `ready`
- `searching`
- `navigating`
- `unavailable`

#### Thumbnails

Thumbnails remain useful for fixed-layout formats but stop being a permanent presence.

Behavior:

- open on demand;
- keep the active page visually anchored in the strip or grid;
- preserve lazy loading and virtualization;
- degrade gracefully when thumbnails are not meaningful.

#### Annotations

Annotation is an explicit mode of intent, not an always-exposed tool cluster.

Behavior:

- enter through `Annotate`;
- reveal `Compact Annotation Toolbar`;
- persist active tool and active color;
- return to the clean shell on exit;
- prioritize full capabilities for PDF;
- expose reduced or capability-driven behavior for EPUB and TXT.

States:

- `inactive`
- `armed`
- `selecting`
- `annotating`
- `editingNote`
- `dismissed`

Constraint:

anchored annotation affordances are only premium-ready where geometry and selection bounds are reliable.

#### Comments / Notes

Comments should support annotation workflows without turning the reader into a heavy collaboration workspace.

Behavior:

- primary entry via annotation or selection;
- open a small composer first;
- reveal full thread only on demand;
- navigate from comment to annotated target with clear visual correspondence.

States:

- `closed`
- `composerOpen`
- `threadOpen`
- `saving`
- `error`

Dependencies:

- stable mapping between comment record and document target;
- selection or annotation context when comment creation starts;
- capability check for threaded comments when the backing product surface does not support replies.

Scope note:

comments are not part of the first implementation slice and should not block the phase-1 plan. This section exists only to keep the end-state architecture coherent.

#### Themes and typography

Theme and type controls must remain accessible without rebuilding persistent chrome.

Behavior:

- quick theme choices in overflow: `Light`, `Sepia`, `Dark`, `Auto`;
- instant preview;
- greater prominence for typography controls in EPUB and TXT;
- PDF shell styling should not imply that PDF page content can always be re-themed in the same way as reflowable formats.

### Format-specific behavior

#### PDF

- prioritize page navigation, zoom, thumbnails, search with page context, and annotations;
- treat `Page Jump Pill` as a primary affordance;
- support richer annotation behavior where engine capabilities allow it.

#### EPUB

- prioritize section navigation, chapter progress, typography, and reading flow;
- use section-aware navigation rather than forced page metaphors;
- make theme and text controls easier to reach;
- prefer section or progress semantics over absolute page counts.

#### TXT

- keep the shell intentionally minimal;
- emphasize theme, font size, search, and linear progress;
- hide advanced affordances like thumbnails and premium annotation flows by default.

### Visual system guardrails

This spec defines a visual direction, not a full design system rewrite.

Required semantic tokens:

- `surface.floating`
- `surface.sheet`
- `surface.overlay`
- `surface.dimmed`
- `text.primary`
- `text.secondary`
- `accent.interactive`
- `border.subtle`
- `shadow.floating`
- `radius.pill`
- `radius.sheet`
- `motion.enter`
- `motion.exit`
- `motion.emphasis`

Rules:

- surfaces should feel light, elevated, and intentional rather than rigid and panel-heavy;
- rely less on permanent dividers and more on spacing, contrast, translucency, and elevation;
- motion should be short and useful;
- respect reduced-motion preferences;
- preserve contrast and legibility over blur aesthetics.

Component recipes that must be defined during implementation:

- `Floating Top Controls`
- `Floating Bottom Dock`
- `Search Pill`
- `Page Jump Pill`
- `Compact Annotation Toolbar`
- `Info Sheet`
- `Document Actions Sheet`
- `Utility Surface`

### Enabling architecture

#### State model

The shell requires a new reader state model that is not tied to legacy shell components.

Core contracts:

- `ReadingMode`
- `ActiveSurface`
- `DocumentLocation`
- `SelectionState`
- `AnnotationSession`
- `ViewportState`
- `CapabilityState`

The UI packages interpret these contracts rather than owning the source of truth independently.

Ownership:

- `@papyrus-sdk/core` owns the canonical shell state;
- engines publish document facts, navigation outcomes, geometry, and capabilities into that state;
- `ui-react` and `ui-react-native` render from the same logical contracts and dispatch intent events back to core.

Minimum schemas:

- `ReadingMode`: `'focus' | 'controlsVisible' | 'readingDimmed' | 'modalSurfaceOpen' | 'annotate'`
- `ActiveSurface`: `'none' | 'search' | 'jump' | 'outline' | 'thumbnails' | 'comments' | 'info' | 'documentActions' | 'theme'`
- `SelectionState`: `{ kind: 'none' | 'text' | 'range'; isCollapsed: boolean; target?: NavigationTarget; bounds?: RectLike[] }`
- `AnnotationSession`: `{ active: boolean; tool: AnnotationTool | null; color: string | null; draftTarget?: NavigationTarget }`
- `ViewportState`: `{ scale: number; scrollOffset: { x: number; y: number }; anchor?: { x: number; y: number }; visibleRange?: number[] }`
- `CapabilityState`: `{ status: 'unknown' | 'ready' | 'partial'; values: ReaderCapabilities; errors: string[] }`

Transition rules:

- only one `ActiveSurface` may be primary at a time;
- entering `annotate` may coexist with a contextual overlay, but not with another primary utility surface unless explicitly required;
- `readingDimmed` cannot coexist with `modalSurfaceOpen`;
- capability state begins as `unknown`, then resolves to `ready` or `partial` after document load and engine probing.

Phase-1 transition rules:

- opening `search`, `jump`, `info`, or `documentActions` always exits `readingDimmed` and sets `ReadingMode = 'modalSurfaceOpen'`;
- closing the active phase-1 surface restores `ReadingMode = 'controlsVisible'`;
- `search` and `jump` are mutually exclusive primary surfaces;
- `info` and `documentActions` are mutually exclusive primary surfaces;
- phase 1 does not allow entry into `annotate` from the new shell surfaces because annotation redesign is explicitly deferred.

#### DocumentLocation

The location contract must avoid collapsing every format into pages.

Proposed structure:

- `kind: 'page' | 'section' | 'progress' | 'range'`
- `label`
- `primaryValue`
- `secondaryValue`
- `engineTarget`

Examples:

- PDF: `12 / 248`
- EPUB: `Chapter 4`, `37%`
- TXT: `62%`

Related navigation contract:

- `NavigationTarget`: `{ kind: 'page' | 'section' | 'searchHit' | 'annotation' | 'comment'; location: DocumentLocation; engineTarget: unknown; previewText?: string; highlightRange?: { start: number; end: number } }`

Rule:

search results, jump actions, comment links, and annotation navigation must all resolve through `NavigationTarget` rather than bespoke per-surface payloads.

#### Capability model

Capabilities must be explicit, queryable, and resolved from engine plus loaded document.

Initial capability shape:

- `navigation.page`
- `navigation.section`
- `navigation.thumbnail`
- `navigation.outline`
- `search.text`
- `selection.text`
- `zoom.precise`
- `annotations.pdfMarkup`
- `annotations.textHighlight`
- `comments.threaded`
- `documentActions.share`
- `documentActions.export`
- `documentActions.rotate`
- `documentActions.reorder`
- `appearance.typography`
- `appearance.pageTheme`

Rule:

the shell shows or hides affordances based on capability, not scattered platform checks.

Resolution lifecycle:

1. document load starts with `CapabilityState.status = 'unknown'`;
2. engine declares static capabilities available for the document type and platform;
3. document-specific probes refine that set after load, outline fetch, or geometry setup;
4. unresolved or failed probes move the state to `partial`, not silent success;
5. the shell hides risky affordances when capability status is `unknown` or `partial`, unless the action is safe to show in a disabled explanatory state.

Failure handling:

- wrong-positive capability detection is treated as a bug because it exposes broken UI;
- wrong-negative detection is acceptable temporarily if it fails closed and the reader remains usable;
- capability errors are logged and surfaced in diagnostics, not as blocking reader modals.

#### Geometry and anchoring

The target contract for stable overlays and annotation positioning includes:

- `pageRect`
- `contentRect`
- `viewportRect`
- `scale`
- `scrollOffset`
- `transform`
- `visibleRange`
- `anchorPoint`
- `selectionBounds`
- `annotationBounds`

This contract is part of the target architecture, but the first slice does not require full parity across all engines.

Rule:

anchored overlays must not be marketed as premium-ready until the geometry contract is trustworthy on the active surface.

#### Controlled breaking changes

The next major UI surface should move away from legacy composition primitives and toward a higher-level shell model.

Target composition direction:

- `ReadingShell`
- `ContentStage`
- `TopControls`
- `BottomDock`
- `UtilitySurface`
- `ContextOverlayHost`

Legacy shell components may remain temporarily for migration, but they are not the source architecture for the redesign.

### First-slice unit interfaces

The following units must be specific enough to estimate, split, and test independently in the phase-1 plan.

#### Floating Top Controls

Required contents:

- truncated title or document label;
- location affordance using `DocumentLocation.label`;
- overflow trigger;
- optional back or close affordance when embedded by the host application.

Behavior:

- always visible in minimal form on desktop;
- visible but visually light on mobile, with optional dimming;
- must not include dense multi-action clusters from the legacy topbar.

Inputs:

- `documentTitle`
- `documentLocation`
- `readingMode`
- `capabilities`
- host navigation affordance flags

Outputs:

- open jump;
- open overflow;
- restore controls from dimmed state.

#### Search Pill

Required contents:

- compact search affordance in the shell;
- focused input when expanded;
- result count when available.

Behavior:

- expands into focused search entry on activation;
- opens the search utility surface with results;
- uses the shared `NavigationTarget` contract for result navigation.

Inputs:

- current query;
- search status;
- result count;
- capability state for text search.

Outputs:

- open search surface;
- update query;
- navigate to selected result target;
- clear or close search.

Platform note:

- desktop may keep the input visible sooner;
- compact screens should prefer a pill that expands into the active search surface.

#### Page Jump Pill

Required contents:

- current visible location label;
- total or contextual secondary value when available.

Behavior:

- opens compact position editing;
- validates input according to the active document format;
- resolves navigation through `DocumentLocation` plus `NavigationTarget`.

Inputs:

- current `DocumentLocation`;
- location edit draft;
- capability state for page or section navigation.

Outputs:

- open jump surface;
- submit validated location target;
- reject invalid input inline;
- close after successful navigation.

Platform note:

- PDF prefers numeric entry;
- EPUB and TXT may switch to section or logical-position entry rather than raw page semantics.

#### Overflow Menu

Required contents for phase 1:

- open `Info Sheet`;
- open `Document Actions Sheet`;
- open theme quick actions;
- expose any remaining global actions that do not deserve permanent chrome.

Behavior:

- compact menu or sheet depending on platform;
- must remain capability-aware;
- must not duplicate search when search already has a primary affordance.

#### Info Sheet

Required contents:

- document title;
- document type;
- source label or origin when available;
- size or file metadata when available;
- page count, chapter count, or equivalent structural summary;
- engine/platform summary for diagnostics if available.

Behavior:

- read-only in phase 1;
- opens from overflow and closes without side effects on reading state.

#### Document Actions Sheet

Required contents for phase 1:

- share, when supported;
- export, when supported;
- open source or reveal origin, when supported;
- placeholder-free omission of unsupported rotate and reorder actions.

Behavior:

- only shows supported actions;
- never shows actions that are known unsupported merely as disabled decoration.

### First implementation slice

The first slice is intentionally constrained to deliver visible quality improvements without waiting for the hardest technical work.

In scope:

- `ReadingShell`
- `Floating Top Controls`
- `Search Pill`
- `Page Jump Pill`
- `Overflow Menu`
- `Info Sheet`
- `Document Actions Sheet`
- lighter utility surface behavior for the covered flows
- explicit capability gating for the new affordances
- reduced visual density in the primary shell

Out of scope:

- `Compact Annotation Toolbar`
- comment thread redesign
- full geometry contract rollout
- advanced EPUB section navigator
- advanced auto-hide gesture policy
- cross-platform rotate or reorder document actions

Rationale:

This slice validates the new shell language and improves perceived product quality without requiring the riskiest work in geometry, selection anchoring, or advanced annotation behavior.

Phase-1 planning boundary:

- the implementation plan produced from this spec must cover only the in-scope items above;
- `Floating Bottom Dock` is not part of phase 1 and should not appear in the first plan backlog except as a future compatibility consideration;
- later phases inform architecture decisions but do not belong in the first execution plan backlog.

### Rollout strategy

#### Phase 1

- introduce shell state and capability contracts;
- implement the new top-level shell in the example apps;
- ship search, jump, overflow, info, and actions surfaces.

#### Phase 2

- expand utility surfaces for outline and thumbnails;
- tune desktop and tablet behavior;
- reduce reliance on old sidebars.

#### Phase 3

- deliver contextual annotations and comments;
- expand geometry-backed overlays where supported.

#### Phase 4

- EPUB polish;
- typography, section navigation, and progress semantics refinement.

#### Phase 5

- broaden geometry contract support;
- normalize advanced document capabilities where viable.

## Error Handling

Errors should remain local unless the document itself cannot be read.

Rules:

- search distinguishes `searching`, `empty`, and `error`;
- utility surfaces show unavailable or empty states in place;
- jump validation errors appear inline and briefly;
- unsupported capabilities are hidden whenever possible;
- document load errors render in the `Content Stage` with retry or reopen actions when available.

The preferred failure mode for utilities is graceful absence, not shell disruption.

## Accessibility

The redesign must remain accessible even though it reduces persistent chrome.

Requirements:

- maintain readable contrast for floating surfaces;
- preserve adequate touch target sizes on compact screens;
- provide visible focus states on web;
- support keyboard navigation for search, jump, outline, and overflow;
- announce important navigation changes to assistive technologies;
- honor reduced-motion preferences;
- never rely only on hover to reveal a required action.

## Testing Strategy

The redesign touches state, composition, and capability gating, so it requires validation at multiple layers.

Contract tests:

- `DocumentLocation` behavior by format;
- capability resolution;
- surface visibility state transitions;
- shell state reducers and stores.

Component tests:

- `Floating Top Controls`
- `Search Pill`
- `Page Jump Pill`
- `Info Sheet`
- `Document Actions Sheet`
- `Utility Surface`

Integration and flow validation:

- open a document in the new shell;
- perform search and navigate to a result with temporary highlight;
- jump to a location;
- open info and actions via overflow;
- validate shell behavior across PDF, EPUB, and TXT for the covered flows.

Platform validation:

- Web: run lint, relevant tests, and build, then validate the example experience manually.
- React Native: run relevant tests and perform the applicable build or example validation for the changed surfaces.
- If browser tooling is available, inspect rendering, console output, and network behavior on the Web example.

If local constraints prevent any of these checks, final reporting must say so explicitly.

## Acceptance Criteria

The first slice is done when:

- the new shell opens documents with reduced persistent chrome;
- `Floating Top Controls` are the primary global controls;
- `Search Pill` supports focus, result navigation, and transient result emphasis;
- `Page Jump Pill` adapts to the active document type;
- `Overflow Menu` consolidates the primary global actions;
- `Info Sheet` and `Document Actions Sheet` exist as dedicated surfaces;
- capabilities determine visible affordances;
- the covered experience is validated in both the Web and mobile examples;
- legacy sidebars are no longer the primary path for the flows covered by the slice.

## Open Decisions For Planning

These questions remain open and should be resolved in the implementation plan rather than in this design spec:

- final public API shape of the next major shell components;
- exact geometry contract rollout per engine;
- EPUB annotation parity level;
- advanced document action support by platform;
- final auto-hide behavior by device class.

## Implementation Boundaries

- Focus implementation planning on the reader shell, state contracts, and covered experience slices.
- Do not mix the first slice with deep annotation anchoring work unless that becomes a direct blocker.
- Keep engine-specific capability work limited to what the covered flows require.
- Avoid broad refactors unrelated to the shell transition.
