# `@papyrus-sdk/engine-cbz-rust`

Experimental CBZ engine backed by the Rust/WASM archive core. It implements the same `ComicEngine` contract as `@papyrus-sdk/engine-cbz` and falls back to the zip.js archive when WASM initialization fails.

Build the artifact with:

```bash
pnpm --filter @papyrus-sdk/engine-cbz-rust build:wasm
pnpm --filter @papyrus-sdk/engine-cbz-rust build
```
