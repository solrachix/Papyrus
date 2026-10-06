import { describe, expect, it } from "vitest";
import {
  clampTextOffset,
  decodeTextBytes,
  findTextRanges,
  textOffsetProgress,
} from "./nativeTextModel";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("nativeTextModel", () => {
  it("decodes UTF-8 with and without BOM", () => {
    expect(decodeTextBytes(bytes(0xef, 0xbb, 0xbf, 0x48, 0xc3, 0xa9))).toBe("Hé");
    expect(decodeTextBytes(bytes(0x48, 0xc3, 0xa9))).toBe("Hé");
  });

  it("decodes UTF-16 little and big endian BOMs", () => {
    expect(decodeTextBytes(bytes(0xff, 0xfe, 0x48, 0x00, 0xe9, 0x00))).toBe("Hé");
    expect(decodeTextBytes(bytes(0xfe, 0xff, 0x00, 0x48, 0x00, 0xe9))).toBe("Hé");
  });

  it("rejects malformed encodings instead of silently replacing characters", () => {
    expect(() => decodeTextBytes(bytes(0xc3, 0x28))).toThrow(/encoding/i);
    expect(() => decodeTextBytes(bytes(0xff, 0xfe, 0x41))).toThrow(/encoding/i);
  });

  it("maps normalized search ranges back to UTF-16 source offsets", () => {
    const source = "🙂 Café\n  café e\u0301";
    const ranges = findTextRanges(source, "cafe");
    expect(ranges).toEqual([
      { start: 3, end: 7 },
      { start: 10, end: 14 },
    ]);
    expect(findTextRanges(source, "é")).toEqual([
      { start: 6, end: 7 },
      { start: 13, end: 14 },
      { start: 15, end: 17 },
    ]);
  });

  it("collapses repeated whitespace while preserving the complete original match range", () => {
    const source = "alpha\n   beta\tgamma";
    expect(findTextRanges(source, "alpha beta gamma")).toEqual([
      { start: 0, end: source.length },
    ]);
  });

  it("finds overlapping repeated matches and clamps logical offsets", () => {
    expect(findTextRanges("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 1, end: 3 },
      { start: 2, end: 4 },
    ]);
    expect(clampTextOffset(-2, 10)).toBe(0);
    expect(clampTextOffset(40, 10)).toBe(10);
    expect(textOffsetProgress(25, 100)).toBe(0.25);
    expect(textOffsetProgress(0, 0)).toBe(0);
  });
});
