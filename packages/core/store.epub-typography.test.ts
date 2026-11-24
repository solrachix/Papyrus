import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_EPUB_TYPOGRAPHY, normalizeEpubTypography, useViewerStore } from "./store";

const initial = useViewerStore.getState();
beforeEach(() => useViewerStore.setState(initial, true));

describe("EPUB typography state", () => {
  it("defaults to the publisher CSS", () => {
    expect(useViewerStore.getState().epubTypography).toEqual(DEFAULT_EPUB_TYPOGRAPHY);
    useViewerStore.getState().initializeStore({});
    expect(useViewerStore.getState().epubTypography).toEqual({ fontFamily: "original", lineHeight: null, margin: "original", textAlign: "original" });
  });
  it("merges valid patches and drops invalid values", () => {
    useViewerStore.getState().setEpubTypography({ fontFamily: "serif", lineHeight: 1.8 });
    useViewerStore.getState().setEpubTypography({ margin: "wide" });
    expect(useViewerStore.getState().epubTypography).toEqual({ fontFamily: "serif", lineHeight: 1.8, margin: "wide", textAlign: "original" });
    expect(normalizeEpubTypography({ fontFamily: "comic" as never, lineHeight: 7, textAlign: "right" as never })).toEqual(DEFAULT_EPUB_TYPOGRAPHY);
  });
  it("accepts initial typography from the config", () => {
    useViewerStore.getState().initializeStore({ initialEpubTypography: { textAlign: "justify" } });
    expect(useViewerStore.getState().epubTypography.textAlign).toBe("justify");
  });
});
