import { beforeEach, describe, expect, it } from "vitest";
import { useViewerStore } from "./store";

describe("text location state", () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
  });

  it("initializes offset and comic presentation without changing page defaults", () => {
    useViewerStore.getState().initializeStore({
      initialTextOffset: 84,
      initialComicLayoutMode: "single",
      initialComicFitMode: "page",
      initialComicReadingDirection: "rtl",
    });
    expect(useViewerStore.getState()).toMatchObject({
      currentPage: 1,
      currentTextOffset: 84,
      comicLayoutMode: "single",
      comicFitMode: "page",
      comicReadingDirection: "rtl",
    });
  });

  it("navigates text search results by UTF-16 offset without changing page", () => {
    const store = useViewerStore.getState();
    store.setDocumentState({ pageCount: 0, currentPage: 1, textLength: 100 });
    store.setSearch("read", [
      {
        kind: "text",
        location: { kind: "textRange", start: 14, end: 18 },
        text: "read this",
        matchIndex: 0,
      },
      {
        kind: "text",
        location: { kind: "textRange", start: 62, end: 66 },
        text: "more reading",
        matchIndex: 1,
      },
    ]);

    store.nextSearchResult();
    expect(useViewerStore.getState()).toMatchObject({
      currentPage: 1,
      activeSearchIndex: 1,
      currentTextOffset: 62,
      scrollToTextOffsetSignal: 62,
      searchResults: [],
    });

    useViewerStore.getState().prevSearchResult();
    expect(useViewerStore.getState()).toMatchObject({
      activeSearchIndex: 0,
      currentTextOffset: 14,
      scrollToTextOffsetSignal: 14,
      currentPage: 1,
    });
  });
});
