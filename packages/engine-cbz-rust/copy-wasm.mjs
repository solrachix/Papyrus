import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(packageDir, "wasm");
const targetDir = join(packageDir, "dist", "wasm");
const bundledTargetDir = join(packageDir, "dist");

mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
cpSync(sourceDir, bundledTargetDir, { recursive: true });
