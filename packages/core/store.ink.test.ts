import { beforeEach, describe, expect, it } from "vitest";
import { useViewerStore } from "./store";
import type { Annotation, InkStrokeCommit } from "@papyrus-sdk/types";

const annotation = (
  id: string,
  type: Annotation["type"],
  pageIndex: number
): Annotation => ({
  id,
  type,
  pageIndex,
  rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  path:
    type === "ink"
      ? [
          { x: 0.1, y: 0.1 },
          { x: 0.3, y: 0.3 },
        ]
      : undefined,
  color: "#111827",
  createdAt: 100,
});

const stroke: InkStrokeCommit = {
  path: [
    { x: 0.4, y: 0.5 },
    { x: 0.6, y: 0.7 },
  ],
  color: "#2563eb",
  opacity: 0.7,
  strokeWidth: 0.01,
};

describe("commitInkStrokesForPage", () => {
  beforeEach(() => {
    useViewerStore.setState({
      annotations: [
        annotation("page-3-ink", "ink", 3),
        annotation("page-3-note", "comment", 3),
        annotation("page-4-ink", "ink", 4),
      ],
      selectedAnnotationId: "page-3-ink",
      annotationUndoStack: [],
      annotationRedoStack: [],
    });
  });

  it("replaces only target-page ink with one undo step and preserves other annotations", () => {
    useViewerStore.getState().commitInkStrokesForPage(3, [stroke]);
    const state = useViewerStore.getState();

    expect(state.annotations.map(({ id }) => id)).toEqual([
      expect.stringMatching(/^ink_/),
      "page-3-note",
      "page-4-ink",
    ]);
    expect(
      state.annotations.find(
        ({ type, pageIndex }) => type === "ink" && pageIndex === 3
      )
    ).toMatchObject({
      type: "ink",
      pageIndex: 3,
      path: stroke.path,
      color: stroke.color,
      opacity: stroke.opacity,
      strokeWidth: stroke.strokeWidth,
    });
    expect(state.annotationUndoStack).toHaveLength(1);
    expect(state.annotationRedoStack).toEqual([]);
    expect(state.selectedAnnotationId).toBeNull();

    state.undoAnnotations();
    expect(useViewerStore.getState().annotations.map(({ id }) => id)).toEqual([
      "page-3-ink",
      "page-3-note",
      "page-4-ink",
    ]);
    state.redoAnnotations();
    expect(
      useViewerStore.getState().annotations.some(
        ({ type, pageIndex }) => type === "ink" && pageIndex === 3
      )
    ).toBe(true);
  });

  it("does not create history when the committed page drawing is unchanged", () => {
    const existing = annotation("stable", "ink", 3);
    useViewerStore.setState({ annotations: [existing], annotationUndoStack: [] });
    const equivalent = {
      path: existing.path!,
      color: existing.color,
      opacity: 1,
      strokeWidth: 0.006,
    };
    useViewerStore.getState().commitInkStrokesForPage(3, [equivalent]);

    expect(useViewerStore.getState().annotationUndoStack).toHaveLength(0);
    expect(useViewerStore.getState().annotations[0]?.id).toBe("stable");
  });

  it("removes all ink from the committed page while preserving other pages and undo", () => {
    useViewerStore.getState().commitInkStrokesForPage(3, []);
    const state = useViewerStore.getState();

    expect(state.annotations.map(({ id }) => id)).toEqual([
      "page-3-note",
      "page-4-ink",
    ]);
    expect(state.annotationUndoStack).toHaveLength(1);

    state.undoAnnotations();
    expect(useViewerStore.getState().annotations.map(({ id }) => id)).toEqual([
      "page-3-ink",
      "page-3-note",
      "page-4-ink",
    ]);
  });
});
