import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("Papyrus EPUB destinations", () => {
  it("preserves each TOC href and serializes chapter and in-chapter navigation", () => {
    for (const file of [
      "packages/ui-react-native/runtime/runtime.js",
      "packages/ui-react-native/runtime/index.html",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("if (href) outlineItem.dest = { kind: 'href', value: href };");
      expect(source).toContain("kind === 'epub-go-to-destination'");
      expect(source).toContain("await activeRendition.display(href)");
      expect(source).toContain("pageIndex >= 0");
      expect(source).toContain("payload.documentSessionId !== documentSessionId");
    }
  });
});
