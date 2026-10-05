import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { useViewerStore } from "@papyrus-sdk/core";
import type { Annotation } from "@papyrus-sdk/types";
import {
  deleteAnnotationAndClearSelection,
  resolveMarkupAnnotationDeleteFallback,
} from "./annotationDeletion";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const iosViewer = read(
  "packages/ui-react-native/components/DedicatedIosPdfViewer.tsx"
);
const annotationEditor = read(
  "packages/ui-react-native/components/AnnotationEditor.tsx"
);
const nativeView = read("packages/engine-native/ios/PapyrusPdfDocumentView.m");

const annotation = (id: string, type: Annotation["type"]): Annotation => ({
  id,
  type,
  pageIndex: 0,
  rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.03 },
  color: "#fbbf24",
  createdAt: 1,
});

describe("annotation deletion routes", () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
  });

  it("keeps the native iOS 16+ edit menu as the markup delete path", () => {
    expect(nativeView).toContain("presentAnnotationEditMenuForId:");
    expect(nativeView).toContain("@available(iOS 16.0, *)");
    expect(nativeView).toContain("self.onAnnotationDelete");
    expect(iosViewer).toContain("supportsNativeEditMenu");
  });

  it("offers a React Native delete fallback for selected markup on older iOS", () => {
    expect(iosViewer).toContain("resolveMarkupAnnotationDeleteFallback");
    expect(iosViewer).toContain("fallbackDeleteAnnotation");
    expect(iosViewer).toContain("t.deleteAnnotation");
  });

  it("shows only the selected markup fallback when the native menu is unavailable", () => {
    const markupAnnotations = [
      annotation("highlight-1", "highlight"),
      annotation("underline-1", "underline"),
      annotation("strikeout-1", "strikeout"),
      annotation("squiggly-1", "squiggly"),
    ];
    const comment = annotation("note-1", "comment");
    const text = annotation("text-1", "text");
    const annotations = [...markupAnnotations, comment, text];

    for (const markup of markupAnnotations) {
      expect(
        resolveMarkupAnnotationDeleteFallback(
          annotations,
          markup.id,
          false
        )
      ).toBe(markup);
    }
    expect(
      resolveMarkupAnnotationDeleteFallback(
        annotations,
        "highlight-1",
        true
      )
    ).toBeNull();
    expect(
      resolveMarkupAnnotationDeleteFallback(
        annotations,
        "note-1",
        false
      )
    ).toBeNull();
    expect(
      resolveMarkupAnnotationDeleteFallback(
        annotations,
        "text-1",
        false
      )
    ).toBeNull();
    expect(
      resolveMarkupAnnotationDeleteFallback(annotations, "missing", false)
    ).toBeNull();
  });

  it("routes deletion through the store action before clearing selection", () => {
    const calls: Array<[string, string | null]> = [];
    deleteAnnotationAndClearSelection(
      "mark-1",
      (id) => calls.push(["remove", id]),
      (id) => calls.push(["select", id])
    );
    expect(calls).toEqual([
      ["remove", "mark-1"],
      ["select", null],
    ]);
  });

  it("removes a selected annotation from the real store and clears its id", () => {
    const selected = annotation("mark-2", "underline");
    useViewerStore.setState({
      annotations: [selected],
      selectedAnnotationId: selected.id,
      annotationUndoStack: [],
      annotationRedoStack: [],
    });

    const store = useViewerStore.getState();
    deleteAnnotationAndClearSelection(
      selected.id,
      store.removeAnnotation,
      store.setSelectedAnnotation
    );

    expect(useViewerStore.getState().annotations).toEqual([]);
    expect(useViewerStore.getState().selectedAnnotationId).toBeNull();
  });

  it("lets the existing comment and text editor delete through store actions", () => {
    expect(annotationEditor).toContain("removeAnnotation");
    expect(annotationEditor).toContain("deleteAnnotationAndClearSelection");
    expect(annotationEditor).toContain("t.deleteAnnotation");
    expect(annotationEditor).toContain("annotation.type === \"text\"");
    expect(annotationEditor).toContain("annotation.type === \"comment\"");
    expect(annotationEditor).toContain("onPress={handleDelete}");
    expect(annotationEditor).toContain("styles.actionDelete");
    expect(annotationEditor).toContain("t.cancel");
    expect(annotationEditor).toContain("t.save");
  });

  it("keeps native markup deletion store-driven through the annotations prop", () => {
    expect(iosViewer).toContain("annotations={annotations}");
    expect(iosViewer).toContain("handleDeleteAnnotation(event.nativeEvent.id)");
    expect(iosViewer).toContain("setSelectedAnnotation(null)");
  });
});
