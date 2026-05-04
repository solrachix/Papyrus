import React, { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import { PapyrusPdfViewerView } from "@papyrus-sdk/engine-native";
import { IconCopy, IconHighlight, IconUnderline, IconCommentBubble } from "../icons";

const TEXT_MARKUP_TOOLS = new Set(["highlight", "underline", "squiggly", "strikeout"]);

type NativeEngineBackdoor = {
  getNativeEngineId?: () => string;
};

type DedicatedAndroidPdfViewerProps = {
  engine: DocumentEngine;
};

export const getDedicatedAndroidPdfEngineId = (
  engine: DocumentEngine
): string | null => {
  const engineId = (engine as DocumentEngine & NativeEngineBackdoor)
    .getNativeEngineId?.();
  return typeof engineId === "string" && engineId.length > 0 ? engineId : null;
};

type SelectionState = {
  text: string;
  pageIndex: number;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
} | null;

export default function DedicatedAndroidPdfViewer({
  engine,
}: DedicatedAndroidPdfViewerProps) {
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const zoom = useViewerStore((state) => state.zoom);
  const currentPage = useViewerStore((state) => state.currentPage);
  const activeTool = useViewerStore((state) => state.activeTool);
  const annotationColor = useViewerStore((state) => state.annotationColor);
  const inkStrokeWidth = useViewerStore((state) => state.inkStrokeWidth);
  const annotationOpacity = useViewerStore((state) => state.annotationOpacity);
  const searchResults = useViewerStore((state) => state.searchResults);
  const annotations = useViewerStore((state) => state.annotations);
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const addAnnotation = useViewerStore((state) => state.addAnnotation);
  const setSelectedAnnotation = useViewerStore((state) => state.setSelectedAnnotation);
  const engineId = getDedicatedAndroidPdfEngineId(engine);

  const [selection, setSelection] = useState<SelectionState>(null);
  const selectionRef = useRef<SelectionState>(null);

  const applySelection = useCallback((type: "highlight" | "underline" | "squiggly" | "strikeout" | "comment") => {
    const sel = selectionRef.current;
    if (!sel || !sel.rects || sel.rects.length === 0) return;
    const bounds = sel.rects.reduce((acc, r) => ({
      x: Math.min(acc.x, r.x),
      y: Math.min(acc.y, r.y),
      width: Math.max(acc.x + acc.width, r.x + r.width) - Math.min(acc.x, r.x),
      height: Math.max(acc.y + acc.height, r.y + r.height) - Math.min(acc.y, r.y),
    }), { x: 1, y: 1, width: 0, height: 0 });
    addAnnotation({
      id: Math.random().toString(36).slice(2, 9),
      pageIndex: sel.pageIndex,
      type,
      rect: bounds,
      rects: sel.rects,
      color: annotationColor,
      content: sel.text,
      createdAt: Date.now(),
    });
    setSelection(null);
    selectionRef.current = null;
  }, [addAnnotation, annotationColor]);

  const copySelection = useCallback(() => {
    const sel = selectionRef.current;
    if (sel?.text) {
      // Clipboard.setString(sel.text); // Would need @react-native-clipboard/clipboard
    }
    setSelection(null);
    selectionRef.current = null;
  }, []);

  if (!engineId) return null;

  return (
    <View style={styles.container}>
      <PapyrusPdfViewerView
        style={styles.viewer}
        engineId={engineId}
        pageTheme={pageTheme}
        zoom={zoom}
        currentPage={currentPage}
        activeTool={activeTool}
        annotationColor={annotationColor}
        inkStrokeWidth={inkStrokeWidth}
        annotationOpacity={annotationOpacity}
        searchResults={searchResults}
        annotations={annotations}
        onPageChanged={(event) => {
          setDocumentState({ currentPage: event.nativeEvent.page });
        }}
        onZoomChanged={(event) => {
          setDocumentState({ zoom: event.nativeEvent.zoom });
        }}
        onAnnotationCreated={(event) => {
          addAnnotation(event.nativeEvent);
        }}
        onAnnotationTap={(event) => {
          setSelectedAnnotation(event.nativeEvent.id);
        }}
        onTextSelected={(event) => {
          const { text, pageIndex, rects } = event.nativeEvent;
          if (!rects || rects.length === 0) {
            setSelection(null);
            selectionRef.current = null;
            return;
          }
          const sel = { text, pageIndex, rects };
          setSelection(sel);
          selectionRef.current = sel;
          if (TEXT_MARKUP_TOOLS.has(activeTool)) {
            applySelection(activeTool as "highlight" | "underline" | "squiggly" | "strikeout");
          }
        }}
      />
      {selection && (
        <>
          <Pressable
            style={styles.overlay}
            onPress={() => {
              setSelection(null);
              selectionRef.current = null;
            }}
          />
          <View style={styles.selectionToolbar} pointerEvents="box-none">
            <View style={styles.toolbarContent}>
              <Pressable
                onPress={() => {
                  copySelection();
                }}
                style={styles.toolbarButton}
              >
                <IconCopy size={20} color="#fff" strokeWidth={2} />
              </Pressable>
              <Pressable
                onPress={() => {
                  applySelection("highlight");
                }}
                style={styles.toolbarButton}
              >
                <IconHighlight size={22} color="#fbbf24" />
              </Pressable>
              <Pressable
                onPress={() => {
                  applySelection("underline");
                }}
                style={styles.toolbarButton}
              >
                <IconUnderline size={22} color="#60a5fa" />
              </Pressable>
              <Pressable
                onPress={() => {
                  applySelection("comment");
                }}
                style={styles.toolbarButton}
              >
                <IconCommentBubble size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  viewer: {
    flex: 1,
  },
  selectionToolbar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 120,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  toolbarContent: {
    flexDirection: "row",
    backgroundColor: "rgba(30, 30, 30, 0.92)",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  toolbarButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  toolbarButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
});
