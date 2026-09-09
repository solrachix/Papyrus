import { describe, expect, it } from "vitest";

import { shouldRemoveThumbnailClipping } from "./thumbnailClipping";

describe("shouldRemoveThumbnailClipping", () => {
  it("keeps native page surfaces attached", () => {
    expect(shouldRemoveThumbnailClipping({ useNativePreview: true })).toBe(false);
  });

  it("keeps clipping for regular image previews", () => {
    expect(shouldRemoveThumbnailClipping({ useNativePreview: false })).toBe(true);
  });
});
