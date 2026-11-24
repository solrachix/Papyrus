import { describe, expect, it } from "vitest";
import { normalizeSearchSnippet, splitSearchSnippet } from "./searchSnippet";

describe("search snippets", () => {
  it("marks every case-insensitive match", () => {
    expect(splitSearchSnippet("O mar, o Mar e o MAR", "mar")).toEqual([
      { text: "O ", match: false }, { text: "mar", match: true }, { text: ", o ", match: false },
      { text: "Mar", match: true }, { text: " e o ", match: false }, { text: "MAR", match: true },
    ]);
  });
  it("ignores accents both ways, keeping the original text", () => {
    expect(splitSearchSnippet("de domínio público.", "publico")).toEqual([
      { text: "de domínio ", match: false }, { text: "público", match: true }, { text: ".", match: false },
    ]);
    expect(splitSearchSnippet("um publico", "público")).toEqual([
      { text: "um ", match: false }, { text: "publico", match: true },
    ]);
  });
  it("returns the plain text without a query and nothing for empty text", () => {
    expect(splitSearchSnippet("texto", " ")).toEqual([{ text: "texto", match: false }]);
    expect(splitSearchSnippet("", "a")).toEqual([]);
  });
  it("collapses whitespace", () => {
    expect(normalizeSearchSnippet("  a\n\n b\t c ")).toBe("a b c");
  });
});
