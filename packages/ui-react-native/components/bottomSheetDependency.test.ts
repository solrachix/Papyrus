import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(__dirname, "..");

describe("mobile sheet dependencies", () => {
  it("does not depend on @gorhom/bottom-sheet", () => {
    const packageJson = readFileSync(
      resolve(packageRoot, "package.json"),
      "utf8"
    );
    const rightSheet = readFileSync(
      resolve(packageRoot, "components", "RightSheet.tsx"),
      "utf8"
    );
    const settingsSheet = readFileSync(
      resolve(packageRoot, "components", "SettingsSheet.tsx"),
      "utf8"
    );

    expect(packageJson).not.toContain("@gorhom/bottom-sheet");
    expect(rightSheet).not.toContain("@gorhom/bottom-sheet");
    expect(settingsSheet).not.toContain("@gorhom/bottom-sheet");
  });

  it("uses the shared native sheet shell for every reader overlay", () => {
    for (const fileName of [
      "OverflowSheet.tsx",
      "SearchResultsSheet.tsx",
      "PageJumpModal.tsx",
    ]) {
      const source = readFileSync(
        resolve(packageRoot, "components", fileName),
        "utf8"
      );

      expect(source).toContain("NativeSheet");
      expect(source).not.toMatch(/\bModal\b/);
    }
  });
});
