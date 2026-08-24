import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const crateDir = join(rootDir, "crates", "papyrus-cbz-rust");
const targetDir = process.env.CARGO_TARGET_DIR
  ? resolve(process.env.CARGO_TARGET_DIR)
  : join(crateDir, "target");
const wasmPath = join(
  targetDir,
  "wasm32-unknown-unknown",
  "release",
  "papyrus_cbz_rust.wasm"
);
const outputDir = join(rootDir, "packages", "engine-cbz-rust", "wasm");

execFileSync(
  "cargo",
  [
    "build",
    "--release",
    "--target",
    "wasm32-unknown-unknown",
    "--manifest-path",
    join(crateDir, "Cargo.toml"),
  ],
  { cwd: rootDir, stdio: "inherit" }
);

mkdirSync(outputDir, { recursive: true });
execFileSync(
  "wasm-bindgen",
  [
    wasmPath,
    "--target",
    "web",
    "--out-dir",
    outputDir,
    "--no-typescript",
  ],
  { cwd: rootDir, stdio: "inherit" }
);
