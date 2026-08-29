# Demo and Comparisons Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dedicated demo and comparisons entry points to the English and Portuguese documentation without duplicating the viewer implementation.

**Architecture:** Reuse the existing `DemoFrame` and built `examples/web` demo for `/demo`. Add documentation-only comparison landing pages with capability criteria and links to existing articles. Extend the VitePress nav/sidebar configuration for both locales.

**Tech Stack:** VitePress, Markdown, Vue theme components, existing Vite demo build.

---

### Task 1: Add dedicated demo pages

**Files:**
- Create: `docs/demo.md`
- Create: `docs/pt/demo.md`

- [x] Add concise value proposition, capabilities, and a prominent `<DemoFrame />`.
- [x] Link to technical examples and quickstart.

### Task 2: Add comparison landing pages

**Files:**
- Create: `docs/comparisons.md`
- Create: `docs/pt/comparisons.md`

- [x] Add capability matrix without unsupported performance claims.
- [x] Link to PDFTron/Apryse, open-source SDK, and benchmark methodology content.

### Task 3: Wire navigation and sidebars

**Files:**
- Modify: `docs/.vitepress/config.mts`

- [x] Add Demo and Comparisons to English and Portuguese navigation.
- [x] Add both pages to the relevant sidebars.

### Task 4: Validate

- [x] Run `pnpm docs:build`.
- [x] Verify all four routes render and the demo iframe loads.
- [x] Run `git diff --check`.
