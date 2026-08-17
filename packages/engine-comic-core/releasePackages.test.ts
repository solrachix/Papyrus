import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("npm release package discovery", () => {
  it("includes public packages added after the May release", () => {
    const output = execFileSync(
      process.execPath,
      [resolve(process.cwd(), "scripts/publish-changed.js"), "--dry-run", "--build-only"],
      {
        cwd: process.cwd(),
        env: { ...process.env, BASE_REF: "8cbd7f7" },
        encoding: "utf8",
      },
    );

    for (const packagePath of [
      "packages/engine-cbr",
      "packages/engine-cbr-mobile",
      "packages/engine-cbz",
      "packages/engine-comic-core",
      "packages/engine-rust",
    ]) {
      expect(output).toContain(`- ${packagePath}`);
    }

    expect(output).toContain(
      "Skipping build for packages/engine-cbr-mobile (no build script)",
    );
  });
});
