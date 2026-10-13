import { describe, expect, it, vi } from "vitest";
import { flattenOutline, navigateEpubOutlineEntry } from "./rightSheetOutline";

describe("EPUB outline adapters", () => {
  it("preserves destination anchors and hierarchy in flattened rows", () => {
    const destination = { kind: "pageIndex" as const, value: 3 };
    const entries = flattenOutline(
      [{
        title: "Part I",
        pageIndex: 0,
        children: [{ title: "Chapter 2", pageIndex: -1, dest: destination }],
      }],
      true,
    );

    expect(entries.map(({ title, depth, disabled }) => ({ title, depth, disabled }))).toEqual([
      { title: "Part I", depth: 0, disabled: false },
      { title: "Chapter 2", depth: 1, disabled: false },
    ]);
    expect(entries[1].value.dest).toBe(destination);
    expect(flattenOutline([{ title: "No destination", pageIndex: -1, dest: destination }], false)[0].disabled).toBe(true);
  });

  it("navigates by the href destination before falling back to its page index", async () => {
    const destination = { kind: "pageIndex" as const, value: 2 };
    const goToDestination = vi.fn().mockResolvedValue(7);
    const navigateToPageIndex = vi.fn();
    const close = vi.fn();

    await navigateEpubOutlineEntry({
      item: { title: "Chapter", pageIndex: 2, dest: destination },
      goToDestination,
      navigateToPageIndex,
      close,
    });

    expect(goToDestination).toHaveBeenCalledWith(destination);
    expect(navigateToPageIndex).toHaveBeenCalledWith(7);
    expect(close).toHaveBeenCalledOnce();
  });

  it("falls back to page index when an EPUB destination cannot resolve", async () => {
    const navigateToPageIndex = vi.fn();
    const close = vi.fn();

    await navigateEpubOutlineEntry({
      item: { title: "Chapter", pageIndex: 2, dest: "chapter.xhtml#part" },
      goToDestination: vi.fn().mockResolvedValue(null),
      navigateToPageIndex,
      close,
    });

    expect(navigateToPageIndex).toHaveBeenCalledWith(2);
    expect(close).toHaveBeenCalledOnce();
  });
});
