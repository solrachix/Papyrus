import { describe, expect, it } from "vitest";
import { inferDocumentType } from "./documentType";

describe("inferDocumentType", () => {
  it.each([
    ["https://example.test/book.cbz", "comic"],
    ["file:///documents/book.cbr", "comic"],
    ["data:application/vnd.comicbook+zip;base64,AAAA", "comic"],
    ["data:application/epub+zip;base64,AAAA", "epub"],
  ])("detects comic source %s", (source, expected) => {
    expect(inferDocumentType(source)).toBe(expected);
  });

  it("keeps existing document type detection", () => {
    expect(inferDocumentType("file:///documents/book.epub")).toBe("epub");
    expect(inferDocumentType("file:///documents/book.txt")).toBe("text");
    expect(inferDocumentType("file:///documents/book.pdf")).toBe("pdf");
  });
});
