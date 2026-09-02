import { describe, expect, it } from "vitest";
import { textFixtures } from "./textFixtures";

describe("TXT fixtures", () => {
  it("keeps multiline and Unicode content deterministic", () => {
    expect(textFixtures.multiline).toContain("line two\nline three");
    expect(textFixtures.unicode).toContain("ação, coração, maçã e ç");
    expect(textFixtures.unicode).toContain("travessão — preservados");
  });

  it("contains a non-empty large fixture and an explicit empty fixture", () => {
    expect(textFixtures.large.split("\n")).toHaveLength(1200);
    expect(textFixtures.empty).toBe("");
  });
});
