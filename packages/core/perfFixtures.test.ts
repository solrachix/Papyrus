import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts/benchmarks/perf-fixtures.mjs");

const runCatalog = (output: string) =>
  JSON.parse(
    execFileSync(process.execPath, [SCRIPT, "--output", output], {
      encoding: "utf8",
    })
  );

describe("performance fixtures", () => {
  it("generates deterministic fixtures with page counts and SHA-256 hashes", () => {
    const firstOutput = mkdtempSync(join(tmpdir(), "papyrus-pr13-first-"));
    const secondOutput = mkdtempSync(join(tmpdir(), "papyrus-pr13-second-"));

    try {
      const first = runCatalog(firstOutput);
      const second = runCatalog(secondOutput);

      expect(first.fixtures.map(({ id, pageCount }) => ({ id, pageCount }))).toEqual([
        { id: "small-20", pageCount: 20 },
        { id: "medium-200", pageCount: 200 },
        { id: "large-1000", pageCount: 1000 },
        { id: "image-heavy", pageCount: 20 },
        { id: "varied-sizes", pageCount: 100 },
        { id: "text-heavy", pageCount: 100 },
      ]);
      expect(first.fixtures.map(({ sha256 }) => sha256)).toEqual(
        second.fixtures.map(({ sha256 }) => sha256)
      );
      for (const fixture of first.fixtures) {
        expect(readFileSync(fixture.path)).toHaveLength(fixture.bytes);
        expect(fixture.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    } finally {
      rmSync(firstOutput, { recursive: true, force: true });
      rmSync(secondOutput, { recursive: true, force: true });
    }
  });
});
