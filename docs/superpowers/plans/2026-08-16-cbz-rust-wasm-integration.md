# CBZ Rust/WASM Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rust CBZ PoC usable through the real `ComicEngine` contract in the browser, while preserving the current `zip.js` engine as a fallback and exposing a separate `rust-cbz` demo route for validation.

**Architecture:** Extend the isolated `papyrus-cbz-rust` crate with wasm-bindgen exports for page metadata and page-byte extraction. Add a small `@papyrus-sdk/engine-cbz-rust` adapter that implements `ComicEngine`, creates Blobs from Rust-extracted bytes, and falls back to the shared zip.js archive opener when WASM initialization fails. Keep `@papyrus-sdk/engine-cbz` unchanged in its public behavior; the demo opts into the new route explicitly.

**Tech Stack:** Rust 2021, `zip`, `wasm-bindgen`, wasm-bindgen CLI, TypeScript, `@papyrus-sdk/engine-comic-core`, `@zip.js/zip.js`, Vite, Vitest.

---

## Chunk 1: Define the WASM/core contract with failing tests

### Task 1: Add Rust WASM-facing API tests

**Files:**
- Modify: `crates/papyrus-cbz-rust/src/lib.rs`
- Modify: `crates/papyrus-cbz-rust/tests/core.rs`

- [ ] Add native tests for stable page metadata (`page_name`, `page_size`) and invalid page indexes.
- [ ] Add the wasm-bindgen wrapper contract under `cfg(target_arch = "wasm32")`, exposing `WasmCbzCore::new`, `page_count`, `page_name`, `page_size`, and `read_page`.
- [ ] Run `cargo test --manifest-path crates/papyrus-cbz-rust/Cargo.toml` and confirm the new tests fail before the implementation is complete.
- [ ] Implement the minimal wrapper and run the Rust tests again.

## Chunk 2: Generate and consume the browser artifact

### Task 2: Add the CBZ WASM build pipeline

**Files:**
- Create: `scripts/build-cbz-rust-wasm.mjs`
- Create: `packages/engine-cbz-rust/package.json`
- Create: `packages/engine-cbz-rust/wasm/.gitkeep` only if the output directory cannot be created by the build

- [ ] Build `papyrus-cbz-rust` for `wasm32-unknown-unknown`.
- [ ] Run wasm-bindgen with `--target web --no-typescript` into `packages/engine-cbz-rust/wasm`.
- [ ] Add package scripts for `build:wasm` and `build`, matching `engine-rust` conventions.
- [ ] Run the build and verify the generated glue and `.wasm` are present.

### Task 3: Write the TypeScript adapter tests first

**Files:**
- Create: `packages/engine-cbz-rust/index.ts`
- Create: `packages/engine-cbz-rust/index.test.ts`
- Create: `packages/engine-cbz-rust/zipArchive.ts`
- Modify: `packages/engine-cbz/index.ts`

- [ ] Extract the current zip.js archive-opening logic into a reusable `openZipComicArchive` helper without changing CBZ behavior.
- [ ] Test that `RustCBZEngine` passes the source bytes to its runtime factory, exposes page count/order, and returns page blobs with the expected MIME type.
- [ ] Test that a rejected Rust runtime factory falls back to the zip.js archive and still exposes pages.
- [ ] Run the focused Vitest test and confirm it fails before the adapter implementation.
- [ ] Implement `RustCBZEngine`, `RustCbzRuntimeFactory`, and the bundled WASM factory.
- [ ] Run the focused tests and the existing CBZ/core tests.

## Chunk 3: Wire the real demo route

### Task 4: Add an explicit `rust-cbz` browser path

**Files:**
- Modify: `examples/web/App.tsx`
- Modify: `examples/web/vite.config.ts`
- Modify: `examples/web/App.phase1-shell.test.tsx` if the engine union/select needs coverage

- [ ] Add `rust-cbz` to the demo engine kind and select options.
- [ ] Instantiate `RustCBZEngine` for that route and use the existing generated demo CBZ as its default source.
- [ ] Add a Vite alias for the new workspace package.
- [ ] Keep `cbz` mapped to the current JS engine so the comparison remains available.
- [ ] Run the existing web tests.

## Chunk 4: Browser validation and fallback proof

### Task 5: Build, run, and verify in the browser

**Files:**
- Modify: `scripts/benchmarks/README.md`
- Modify: `packages/engine-cbz-rust/README.md`

- [ ] Build the Rust WASM artifact and the adapter package.
- [ ] Start the demo and verify `http://localhost:3005/render?engine=rust-cbz` loads pages, thumbnails, and page navigation.
- [ ] Read browser logs and verify there is no WASM panic on the CBZ path.
- [ ] Exercise the fallback with a rejected runtime factory test and document that the browser route is opt-in.
- [ ] Document that the PoC remains CBZ-only; CBR/RAR still requires a separate libarchive-compatible comparison.

## Chunk 5: Final verification and handoff

- [ ] Run Rust tests, Clippy, focused Vitest, full `pnpm test:phase1`, and `git diff --check`.
- [ ] Inspect generated artifacts and ensure no unrelated files or dependency symlinks are tracked.
- [ ] Record native benchmark results and browser evidence separately; do not claim the native numbers are browser rendering numbers.
- [ ] Leave changes on `codex/comic-rust-poc` without merging or publishing unless explicitly requested.
