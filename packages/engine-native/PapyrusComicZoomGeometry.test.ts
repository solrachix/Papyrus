import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("iOS comic zoom geometry", () => {
  it("keeps page sizing, focal anchors, and document-edge clamping correct", () => {
    const root = process.cwd();
    const tempDirectory = mkdtempSync(join(tmpdir(), "papyrus-comic-zoom-"));
    const executable = join(tempDirectory, "geometry-test");
    const source = resolve(root, "packages/engine-native/tests/PapyrusComicZoomGeometryTest.c");
    const compiler = process.env.CC || "cc";

    try {
      execFileSync(compiler, ["-std=c11", "-Wall", "-Wextra", "-Werror", source, "-lm", "-o", executable]);
      execFileSync(executable);
      expect(true).toBe(true);
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});
