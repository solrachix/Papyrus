# Papyrus Reading Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the phase-1 reading shell redesign for Web and React Native with shared shell state, capability gating, search/jump/info/actions surfaces, and example-app validation.

**Architecture:** Add the new shell contracts in `@papyrus-sdk/types` and `@papyrus-sdk/core`, then build phase-1 shell components in `@papyrus-sdk/ui-react` and `@papyrus-sdk/ui-react-native` without mixing in deferred annotation work. Integrate the new shell into `examples/web` and `examples/mobile`, keeping legacy sidebar-heavy flows available only as non-primary fallback paths during the transition.

**Tech Stack:** TypeScript, Zustand, React 18, React Native 0.81, Vite, tsup, Jest, Vitest, Testing Library

---

## File Structure

### Shared contracts and state

- Modify: `package.json`
  - Add workspace-level test tooling for phase-1 shell work.
- Create: `vitest.config.ts`
  - Shared Vitest config for `packages/core`, `packages/ui-react`, and `examples/web`.
- Modify: `packages/types/index.ts`
  - Add `ReadingMode`, `ActiveSurface`, `DocumentLocation`, `NavigationTarget`, and `ReaderCapabilities`.
- Modify: `packages/core/store.ts`
  - Add shell state, transitions, capability lifecycle, and phase-1 helpers.
- Modify: `packages/core/index.ts`
  - Re-export new shell helpers.
- Create: `packages/core/store.phase1-shell.test.ts`
  - Contract tests for phase-1 shell state and transitions.

### Web UI package

- Create: `packages/ui-react/components/ReadingShell.tsx`
  - New shell composition wrapper for phase-1.
- Create: `packages/ui-react/components/FloatingTopControls.tsx`
  - Minimal global controls, title, jump affordance, overflow.
- Create: `packages/ui-react/components/SearchPill.tsx`
  - Search entry affordance and query handoff.
- Create: `packages/ui-react/components/PageJumpPill.tsx`
  - Format-aware location affordance and jump entry.
- Create: `packages/ui-react/components/UtilitySurface.tsx`
  - Shared shell surface for search results.
- Create: `packages/ui-react/components/InfoSheet.tsx`
  - Read-only document metadata surface.
- Create: `packages/ui-react/components/DocumentActionsSheet.tsx`
  - Capability-driven global actions surface.
- Modify: `packages/ui-react/index.ts`
  - Export the new shell components.
- Create: `packages/ui-react/components/ReadingShell.test.tsx`
  - Component tests for top controls, search, jump, and overflow surface switching.

### Web example

- Modify: `examples/web/App.tsx`
  - Replace primary layout wiring with the new shell.
- Create: `examples/web/App.phase1-shell.test.tsx`
  - Smoke test for search/jump/info/actions flow in the demo shell.

### React Native UI package

- Create: `packages/ui-react-native/components/ReadingShell.tsx`
  - Phase-1 shell wrapper for mobile.
- Create: `packages/ui-react-native/components/OverflowSheet.tsx`
  - Entry point to theme/info/actions.
- Create: `packages/ui-react-native/components/InfoSheet.tsx`
  - Mobile info surface.
- Create: `packages/ui-react-native/components/DocumentActionsSheet.tsx`
  - Mobile actions surface.
- Modify: `packages/ui-react-native/components/Topbar.tsx`
  - Reduce permanent chrome and align with phase-1 top controls.
- Modify: `packages/ui-react-native/components/RightSheet.tsx`
  - Treat pages/outline/search as contextual sheets rather than permanent secondary structure.
- Modify: `packages/ui-react-native/index.ts`
  - Export phase-1 shell pieces.
- Create: `packages/ui-react-native/components/ReadingShell.test.tsx`
  - RN shell tests using the existing Jest stack.

### React Native example

- Modify: `examples/mobile/App.tsx`
  - Replace direct `Topbar`/`BottomBar`/`SettingsSheet` wiring with the new shell.
- Modify: `examples/mobile/__tests__/App.test.tsx`
  - Update smoke coverage to assert the new shell renders.

### Docs

- Modify: `docs/superpowers/specs/2026-03-31-papyrus-reading-experience-redesign-design.md`
  - Link to completed phase-1 plan after implementation if needed.

## Chunk 1: Shared Contracts And Web Shell

### Task 1: Add phase-1 test harness

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Test: `pnpm vitest run packages/core/store.phase1-shell.test.ts`

- [ ] **Step 1: Add failing plan-driven test tooling config**

Add root dev dependencies and shared test/lint scripts:

```json
{
  "scripts": {
    "test:phase1": "vitest run",
    "lint:phase1": "eslint packages/ui-react/components packages/ui-react-native/components packages/core examples/web examples/mobile/App.tsx examples/mobile/__tests__ --ext .ts,.tsx"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.30.1",
    "@typescript-eslint/parser": "^8.30.1",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "eslint": "^9.24.0",
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create the shared Vitest config**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "examples/web/**/*.test.tsx",
    ],
  },
});
```

Create a minimal root ESLint config too:

```js
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["packages/**/*.ts", "packages/**/*.tsx", "examples/web/**/*.ts", "examples/web/**/*.tsx"],
    languageOptions: { parser: tsParser },
    plugins: { "@typescript-eslint": tseslint },
  },
];
```

- [ ] **Step 3: Run the empty shell test target to verify the harness is wired**

Run: `pnpm test:phase1`

Expected: FAIL because the planned phase-1 test files do not exist yet.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts eslint.config.js
git commit -m "test: add phase-1 shell web test and lint harness"
```

### Task 2: Add shared shell contracts in types and core

**Files:**
- Modify: `packages/types/index.ts`
- Modify: `packages/core/store.ts`
- Modify: `packages/core/index.ts`
- Create: `packages/core/store.phase1-shell.test.ts`

- [ ] **Step 1: Write the failing shell-state contract tests**

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useViewerStore } from "./store";

describe("phase-1 shell state", () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
  });

  it("opens search as the only active primary surface", () => {
    const store = useViewerStore.getState();
    store.openActiveSurface("search");
    expect(useViewerStore.getState().activeSurface).toBe("search");
    expect(useViewerStore.getState().readingMode).toBe("modalSurfaceOpen");
  });

  it("restores controlsVisible when the active surface closes", () => {
    const store = useViewerStore.getState();
    store.openActiveSurface("info");
    store.closeActiveSurface();
    expect(useViewerStore.getState().readingMode).toBe("controlsVisible");
    expect(useViewerStore.getState().activeSurface).toBe("none");
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pnpm vitest run packages/core/store.phase1-shell.test.ts`

Expected: FAIL with missing `openActiveSurface`, `closeActiveSurface`, or missing shell fields.

- [ ] **Step 3: Add the new type contracts in `packages/types/index.ts`**

Add minimal shared contracts:

```ts
export type ReadingMode =
  | "focus"
  | "controlsVisible"
  | "readingDimmed"
  | "modalSurfaceOpen"
  | "annotate";

export type ActiveSurface =
  | "none"
  | "search"
  | "jump"
  | "outline"
  | "thumbnails"
  | "comments"
  | "info"
  | "documentActions"
  | "theme";

export interface DocumentLocation {
  kind: "page" | "section" | "progress" | "range";
  label: string;
  primaryValue: number | string;
  secondaryValue?: number | string;
  engineTarget?: unknown;
}

export interface ReaderCapabilities {
  "search.text"?: boolean;
  "navigation.page"?: boolean;
  "navigation.section"?: boolean;
  "documentActions.share"?: boolean;
  "documentActions.export"?: boolean;
}

export interface CapabilityState {
  status: "unknown" | "ready" | "partial";
  values: ReaderCapabilities;
  errors: string[];
}
```

- [ ] **Step 4: Extend the core store with phase-1 shell state and transitions**

Add state and helpers such as:

```ts
readingMode: "focus",
activeSurface: "none",
documentLocation: { kind: "page", label: "1/0", primaryValue: 1, secondaryValue: 0 },
capabilityState: { status: "unknown", values: {}, errors: [] },

openActiveSurface: (surface) =>
  set({
    activeSurface: surface,
    readingMode: "modalSurfaceOpen",
    mobileChromeVisible: true,
  }),
closeActiveSurface: () =>
  set({
    activeSurface: "none",
    readingMode: "controlsVisible",
  }),
setDocumentLocation: (location) => set({ documentLocation: location }),
setCapabilityState: (capabilityState) => set({ capabilityState }),
```

- [ ] **Step 5: Export the new shell contracts and helpers**

Update `packages/core/index.ts` so the new store API is available to both UI packages.

- [ ] **Step 6: Run the core shell tests**

Run: `pnpm vitest run packages/core/store.phase1-shell.test.ts`

Expected: PASS

- [ ] **Step 7: Build the shared packages that depend on the new contracts**

Run:
- `pnpm --filter @papyrus-sdk/types build`
- `pnpm --filter @papyrus-sdk/core build`

Expected: both PASS with updated type declarations.

- [ ] **Step 8: Commit**

```bash
git add packages/types/index.ts packages/core/store.ts packages/core/index.ts packages/core/store.phase1-shell.test.ts
git commit -m "feat: add phase-1 shell contracts"
```

### Task 3: Build the phase-1 web shell components

**Files:**
- Create: `packages/ui-react/components/ReadingShell.tsx`
- Create: `packages/ui-react/components/FloatingTopControls.tsx`
- Create: `packages/ui-react/components/SearchPill.tsx`
- Create: `packages/ui-react/components/PageJumpPill.tsx`
- Create: `packages/ui-react/components/UtilitySurface.tsx`
- Create: `packages/ui-react/components/InfoSheet.tsx`
- Create: `packages/ui-react/components/DocumentActionsSheet.tsx`
- Modify: `packages/ui-react/index.ts`
- Test: `packages/ui-react/components/ReadingShell.test.tsx`

- [ ] **Step 1: Write the failing web shell component tests**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReadingShell } from "./ReadingShell";
import type { DocumentEngine } from "@papyrus-sdk/types";

const engine = {
  load: async () => {},
  getPageCount: () => 12,
  getCurrentPage: () => 1,
  goToPage: () => {},
  setZoom: () => {},
  getZoom: () => 1,
  rotate: () => {},
  getRotation: () => 0,
  renderPage: async () => {},
  renderTextLayer: async () => {},
  getTextContent: async () => [],
  getPageDimensions: async () => ({ width: 800, height: 1200 }),
  getOutline: async () => [],
  getPageIndex: async () => null,
  destroy: () => {},
} satisfies DocumentEngine;

it("opens search from the floating top controls", async () => {
  render(<ReadingShell engine={engine} title="Papyrus Demo" />);
  await userEvent.click(screen.getByRole("button", { name: /search/i }));
  expect(screen.getByRole("searchbox")).toBeInTheDocument();
});

it("opens the page-jump control and accepts a page number", async () => {
  render(<ReadingShell engine={engine} title="Papyrus Demo" />);
  await userEvent.click(screen.getByRole("button", { name: /page jump/i }));
  expect(screen.getByRole("spinbutton")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the web shell tests to verify they fail**

Run: `pnpm vitest run packages/ui-react/components/ReadingShell.test.tsx`

Expected: FAIL because the new components are missing.

- [ ] **Step 3: Create the shell wrapper and top controls**

Implement a small composition surface:

```tsx
export function ReadingShell({ engine, title }: Props) {
  return (
    <div className="papyrus-reading-shell" data-testid="papyrus-reading-shell">
      <FloatingTopControls engine={engine} title={title} />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <Viewer engine={engine} />
        <UtilitySurface engine={engine} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `UtilitySurface` with explicit phase-1 responsibilities**

It must:
- render search results when `activeSurface === "search"`;
- render `InfoSheet` when `activeSurface === "info"`;
- render `DocumentActionsSheet` when `activeSurface === "documentActions"`;
- close through a single `closeActiveSurface()` path.

```tsx
if (activeSurface === "search") return <SearchResultsSurface engine={engine} onClose={closeActiveSurface} />;
if (activeSurface === "info") return <InfoSheet onClose={closeActiveSurface} />;
if (activeSurface === "documentActions") return <DocumentActionsSheet onClose={closeActiveSurface} />;
return null;
```

- [ ] **Step 5: Implement `SearchPill`, `PageJumpPill`, `InfoSheet`, and `DocumentActionsSheet`**

Keep them capability-driven and phase-1 only:

```tsx
if (!capabilityState.values["search.text"]) return null;
```

```tsx
<button onClick={() => openActiveSurface("info")}>Info</button>
<button onClick={() => openActiveSurface("documentActions")}>Actions</button>
```

- [ ] **Step 6: Update `packages/ui-react/index.ts` exports**

```ts
export { default as Topbar } from "./components/Topbar";
export { ReadingShell } from "./components/ReadingShell";
export { FloatingTopControls } from "./components/FloatingTopControls";
```

- [ ] **Step 7: Run the web shell tests**

Run: `pnpm vitest run packages/ui-react/components/ReadingShell.test.tsx`

Expected: PASS

- [ ] **Step 8: Run lint for the affected web shell files**

Run: `pnpm lint:phase1`

Expected: PASS

- [ ] **Step 9: Build the web UI package**

Run: `pnpm --filter @papyrus-sdk/ui-react build`

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/ui-react/components packages/ui-react/index.ts
git commit -m "feat: add web phase-1 reading shell"
```

### Task 4: Integrate and validate the web example

**Files:**
- Modify: `examples/web/App.tsx`
- Create: `examples/web/App.phase1-shell.test.tsx`

- [ ] **Step 1: Write the failing web example flow test**

```tsx
it("renders the phase-1 shell instead of the legacy sidebar layout", () => {
  render(<App />);
  expect(screen.getByTestId("papyrus-reading-shell")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the example test to verify it fails**

Run: `pnpm vitest run examples/web/App.phase1-shell.test.tsx`

Expected: FAIL because the example still renders `Topbar`, `SidebarLeft`, and `SidebarRight` directly.

- [ ] **Step 3: Replace the primary layout in `examples/web/App.tsx`**

Change:

```tsx
<Topbar engine={engine} />
<SidebarLeft engine={engine} />
<Viewer engine={engine} />
<SidebarRight engine={engine} />
```

to:

```tsx
<ReadingShell engine={engine} title="Papyrus Demo" />
```

- [ ] **Step 4: Keep outline and thumbnails contextual**

Replace fixed mounts of `SidebarLeft` and `SidebarRight` in the primary example route with shell-controlled contextual surfaces only:
- search renders through `UtilitySurface`, not `SidebarRight`;
- outline renders only when `activeSurface === "outline"`;
- thumbnails render only when `activeSurface === "thumbnails"`;
- none of these surfaces mount as fixed structural chrome by default.

- [ ] **Step 5: Run the web example tests**

Run: `pnpm vitest run examples/web/App.phase1-shell.test.tsx`

Expected: PASS

- [ ] **Step 6: Build the web example**

Run: `pnpm --filter @papyrus-sdk/example-web build`

Expected: PASS and Vite outputs the production bundle.

- [ ] **Step 7: Run lint again after wiring the example**

Run: `pnpm lint:phase1`

Expected: PASS

- [ ] **Step 8: Manually validate the web example**

Run: `pnpm dev:web`

Validate:
- document opens with reduced chrome;
- search opens as a contextual surface;
- jump opens and navigates;
- overflow exposes info/actions;
- no fixed left/right sidebar is primary by default.

- [ ] **Step 9: Commit**

```bash
git add examples/web/App.tsx examples/web/App.phase1-shell.test.tsx
git commit -m "feat: wire web demo to phase-1 shell"
```

## Chunk 2: React Native Shell And End-To-End Validation

### Task 5: Build the phase-1 React Native shell components

**Files:**
- Create: `packages/ui-react-native/components/ReadingShell.tsx`
- Create: `packages/ui-react-native/components/OverflowSheet.tsx`
- Create: `packages/ui-react-native/components/InfoSheet.tsx`
- Create: `packages/ui-react-native/components/DocumentActionsSheet.tsx`
- Modify: `packages/ui-react-native/components/Topbar.tsx`
- Modify: `packages/ui-react-native/components/RightSheet.tsx`
- Modify: `packages/ui-react-native/index.ts`
- Test: `packages/ui-react-native/components/ReadingShell.test.tsx`

- [ ] **Step 1: Write the failing RN shell tests**

```tsx
import renderer from "react-test-renderer";
import { ReadingShell } from "./ReadingShell";
import type { DocumentEngine } from "@papyrus-sdk/types";

const engine = {
  load: async () => {},
  getPageCount: () => 12,
  getCurrentPage: () => 1,
  goToPage: () => {},
  setZoom: () => {},
  getZoom: () => 1,
  rotate: () => {},
  getRotation: () => 0,
  renderPage: async () => {},
  renderTextLayer: async () => {},
  getTextContent: async () => [],
  getPageDimensions: async () => ({ width: 800, height: 1200 }),
  getOutline: async () => [],
  getPageIndex: async () => null,
  destroy: () => {},
} satisfies DocumentEngine;

it("renders the mobile phase-1 top controls and overflow entry", () => {
  const tree = renderer.create(<ReadingShell engine={engine} title="Papyrus Mobile" />);
  expect(tree.root.findByProps({ testID: "papyrus-rn-reading-shell" })).toBeTruthy();
  expect(tree.root.findByProps({ accessibilityLabel: "Page jump" })).toBeTruthy();
  expect(tree.root.findByProps({ accessibilityLabel: "Open overflow menu" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the RN shell test target to verify it fails**

Run: `cd examples/mobile && pnpm test -- --runInBand ReadingShell`

Expected: FAIL because the new RN shell is not implemented yet.

- [ ] **Step 3: Create the RN `ReadingShell` and overflow surfaces**

Compose:

```tsx
<Topbar engine={engine} title={title} onOpenOverflow={() => setOverflowOpen(true)} />
<Viewer engine={engine} />
<RightSheet engine={engine} />
<OverflowSheet
  visible={overflowOpen}
  onOpenInfo={() => setInfoOpen(true)}
  onOpenActions={() => setActionsOpen(true)}
  onOpenTheme={() => setThemeOpen(true)}
/>
<InfoSheet visible={infoOpen} onClose={() => setInfoOpen(false)} />
<DocumentActionsSheet visible={actionsOpen} onClose={() => setActionsOpen(false)} />
```

Define the overflow behavior explicitly:
- `OverflowSheet` is the only entry point for `InfoSheet`, `DocumentActionsSheet`, and phase-1 theme actions;
- opening info or actions closes the overflow first;
- info/actions are mutually exclusive;
- none of these sheets may require `RightSheet` to be open.

- [ ] **Step 4: Refactor the RN `Topbar` for phase 1**

Keep:
- short title;
- page jump affordance;
- overflow trigger.

Remove from always-visible chrome:
- settings-heavy control clusters;
- any bottom-dock dependency in the phase-1 path.

Target API:

```tsx
type TopbarProps = {
  engine: DocumentEngine;
  title?: string;
  onOpenOverflow: () => void;
  onOpenJump: () => void;
};
```

Test expectations:
- title is truncated rather than expanded into a full header;
- jump affordance opens the jump modal;
- overflow affordance opens `OverflowSheet`.

- [ ] **Step 5: Make `RightSheet` contextual rather than structural**

Define it as:
- closed by default on document open;
- opened only from explicit actions such as search or pages;
- dismissed by backdrop press, escape-equivalent close, or successful navigation;
- incapable of coexisting with overflow/info/actions as another primary surface.

- [ ] **Step 6: Export the new RN shell components**

Update `packages/ui-react-native/index.ts`.

- [ ] **Step 7: Run the RN shell tests**

Run: `cd examples/mobile && pnpm test -- --runInBand`

Expected: PASS for the new RN shell tests only. The example-app smoke test is updated in Task 6.

- [ ] **Step 8: Build the RN UI package**

Run: `pnpm --filter @papyrus-sdk/ui-react-native build`

Expected: PASS

- [ ] **Step 9: Run lint for the RN package files**

Run: `pnpm lint:phase1`

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/ui-react-native/components packages/ui-react-native/index.ts
git commit -m "feat: add react native phase-1 shell"
```

### Task 6: Integrate the React Native example

**Files:**
- Modify: `examples/mobile/App.tsx`
- Modify: `examples/mobile/__tests__/App.test.tsx`

- [ ] **Step 1: Update the failing mobile app smoke test**

Replace the generic render smoke test with a shell-specific assertion:

```tsx
it("renders the phase-1 mobile reading shell", () => {
  const tree = renderer.create(<App />);
  expect(tree.root.findByProps({ testID: "papyrus-rn-reading-shell" })).toBeTruthy();
});
```

- [ ] **Step 2: Run the mobile example tests to verify the failure**

Run: `cd examples/mobile && pnpm test -- --runInBand`

Expected: FAIL until `App.tsx` uses the new shell.

- [ ] **Step 3: Replace direct shell wiring in the mobile example**

Change:

```tsx
<Topbar ... />
<BottomBar />
<RightSheet ... />
<SettingsSheet ... />
```

to:

```tsx
<ReadingShell engine={engine} title="Papyrus Mobile" />
```

Keep `ToolDock` and `AnnotationEditor` outside the shell chrome:
- `ToolDock` mounts only for `activeType === "pdf"` and remains secondary to the phase-1 shell;
- `AnnotationEditor` stays mounted as an annotation-only overlay and is not opened by the new phase-1 overflow path.

- [ ] **Step 4: Explicitly remove `BottomBar` from the phase-1 example path**

The bottom dock is deferred. Do not reintroduce it as phase-1 chrome.

- [ ] **Step 5: Run mobile lint**

Run: `cd examples/mobile && pnpm lint`

Expected: PASS

- [ ] **Step 6: Run mobile tests**

Run: `cd examples/mobile && pnpm test -- --runInBand`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add examples/mobile/App.tsx examples/mobile/__tests__/App.test.tsx
git commit -m "feat: wire mobile demo to phase-1 shell"
```

### Task 7: Full validation sweep

**Files:**
- Modify: `docs/superpowers/specs/2026-03-31-papyrus-reading-experience-redesign-design.md` (only if implementation notes must be back-linked)

- [ ] **Step 1: Run shared package builds**

Run:
- `pnpm --filter @papyrus-sdk/types build`
- `pnpm --filter @papyrus-sdk/core build`
- `pnpm --filter @papyrus-sdk/ui-react build`
- `pnpm --filter @papyrus-sdk/ui-react-native build`

Expected: all PASS

- [ ] **Step 2: Run web validation**

Run:
- `pnpm test:phase1`
- `pnpm --filter @papyrus-sdk/example-web build`

Expected: PASS

- [ ] **Step 3: Run mobile validation**

Run:
- `cd examples/mobile && pnpm lint`
- `cd examples/mobile && pnpm test -- --runInBand`

Expected: PASS

- [ ] **Step 4: Validate the web example manually**

Run: `pnpm dev:web`

Manual checklist:
- PDF opens with top controls only;
- search behaves as a contextual surface;
- page jump works for PDF and adapts for EPUB/TXT;
- info/actions surfaces open from overflow;
- sidebars are not the default structural layout.
- if browser tooling is available, confirm no unexpected console errors and no failed network requests in the updated flow.

- [ ] **Step 5: Validate the mobile example manually**

Run one of:
- `cd examples/mobile && pnpm android`
- `cd examples/mobile && pnpm ios`

Manual checklist:
- top controls remain minimal;
- overflow opens theme/info/actions;
- right sheet behaves contextually;
- no `BottomBar` is present in the phase-1 flow;
- search/jump/info/actions behave without visual collisions.

Fallback:
- if native simulator/device execution is unavailable, keep Jest + lint + package builds as the executable baseline and report the missing manual native validation explicitly.

- [ ] **Step 6: Commit the validation or follow-up docs note if needed**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts eslint.config.js packages/types/index.ts packages/core packages/ui-react packages/ui-react-native examples/web/App.tsx examples/web/App.phase1-shell.test.tsx examples/mobile/App.tsx examples/mobile/__tests__/App.test.tsx
git commit -m "chore: validate phase-1 reading shell"
```

### Task 8: Optional cleanup after validation

**Files:**
- Modify: `packages/ui-react/components/Topbar.tsx`
- Modify: `packages/ui-react/components/SidebarLeft.tsx`
- Modify: `packages/ui-react/components/SidebarRight.tsx`
- Modify: `packages/ui-react-native/components/BottomBar.tsx`
- Modify: `packages/ui-react-native/components/SettingsSheet.tsx`

- [ ] **Step 1: Identify legacy shell exports still used by the examples**

Run:

```bash
Select-String -Path packages\\ui-react\\**\\*.tsx,packages\\ui-react-native\\**\\*.tsx,examples\\web\\App.tsx,examples\\mobile\\App.tsx -Pattern "SidebarLeft|SidebarRight|BottomBar|SettingsSheet|Topbar"
```

Expected: only intentional fallback paths remain.

- [ ] **Step 2: Remove or annotate only the no-longer-primary paths**

Do not delete legacy components if package consumers still need them. For cleanup in this task, limit changes to:
- add deprecation comments at the top of `SidebarLeft.tsx`, `SidebarRight.tsx`, `BottomBar.tsx`, and `SettingsSheet.tsx` if they remain exported but non-primary;
- remove only example-specific logic that is now dead after the phase-1 shell integration;
- leave public exports intact unless all example and package references are gone.

- [ ] **Step 3: Re-run the full validation sweep**

Run the commands from Task 7 again.

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui-react packages/ui-react-native
git commit -m "refactor: demote legacy shell paths after phase-1 rollout"
```
