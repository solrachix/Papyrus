# CBZ Rust Benchmark PoC Implementation Plan

> **For agentic workers:** Execute this plan task by task and keep the benchmark outputs reproducible.

**Goal:** Measure whether a Rust CBZ archive backend can improve archive opening, page listing, and page-byte extraction relative to the current `zip.js` backend, without changing the production comic engine yet.

**Architecture:** Add an isolated `papyrus-cbz-rust` crate with a small native API and benchmark binary. Generate one deterministic CBZ fixture and feed the exact same bytes to a Node `zip.js` baseline and the Rust benchmark. Keep filtering/order compatible with `engine-comic-core`, and report median timings plus extracted-byte checksums so results cannot silently compare different work.

**Tech Stack:** Rust 2021, `zip`, Node.js, `@zip.js/zip.js`, Vitest, pnpm.

---

## Task 1: Define the Rust CBZ contract with tests first

**Files:**
- Create: `crates/papyrus-cbz-rust/Cargo.toml`
- Create: `crates/papyrus-cbz-rust/src/lib.rs`
- Create: `crates/papyrus-cbz-rust/tests/core.rs`

1. Add tests for loading a ZIP/CBZ byte buffer, filtering image entries, natural ordering (`page-2` before `page-10`), and extracting a selected page.
2. Run `cargo test --manifest-path crates/papyrus-cbz-rust/Cargo.toml` and confirm the new tests fail before implementation.
3. Implement the smallest API needed by the tests: `CbzCore::load`, `page_count`, `pages`, and `read_page`.
4. Run the same test command and confirm it passes.

## Task 2: Add a deterministic fixture generator

**Files:**
- Create: `scripts/benchmarks/generate-cbz.mjs`
- Create: `scripts/benchmarks/README.md`

1. Generate a configurable CBZ with deterministic synthetic image payloads, metadata, and non-page files.
2. Make the output path and page count configurable, defaulting to a temporary file and 1000 pages.
3. Print fixture size, page count, and SHA-256 so both benchmark runners can verify they use the same artifact.

## Task 3: Implement comparable Node and Rust benchmarks

**Files:**
- Create: `scripts/benchmarks/benchmark-cbz.mjs`
- Create: `crates/papyrus-cbz-rust/src/bin/benchmark.rs`

1. Measure cold load/list, first/middle/last page extraction, and all-page extraction.
2. Run warmup iterations, then report median milliseconds, bytes extracted, and checksum for each operation.
3. Keep the Node runner on `zip.js` and the Rust runner on the new crate; do not call browser rendering APIs in this backend-only PoC.
4. Add a command example that creates one fixture and runs both sides against it.

## Task 4: Verify and document limits

**Files:**
- Modify: `scripts/benchmarks/README.md`

1. Run Rust unit/integration tests.
2. Run the Node benchmark and Rust benchmark on the same fixture.
3. Run the existing CBZ package tests if dependencies are available.
4. Document that this is an archive-backend measurement, not proof of browser/WASM rendering improvement; use the results to decide whether a WASM adapter is worth the next PoC.

## Task 5: Review and hand off

1. Inspect the diff for unrelated changes.
2. Record the measured output in the final handoff, including fixture size and command lines.
3. Leave the implementation in `codex/comic-rust-poc` for review; do not merge it into production engine code as part of this PoC.
