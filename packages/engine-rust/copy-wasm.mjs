import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(packageDir, "wasm");
const destinationDir = join(packageDir, "dist", "wasm");
const bundledDestinationDir = join(packageDir, "dist");

mkdirSync(destinationDir, { recursive: true });
for (const file of readdirSync(sourceDir)) {
  copyFileSync(join(sourceDir, file), join(destinationDir, file));
  copyFileSync(join(sourceDir, file), join(bundledDestinationDir, file));
}
