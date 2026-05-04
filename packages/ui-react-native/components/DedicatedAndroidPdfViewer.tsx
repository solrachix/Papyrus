import React from "react";
import { StyleSheet } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import { PapyrusPdfViewerView } from "@papyrus-sdk/engine-native";

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

  if (!engineId) return null;

  return (
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
    />
  );
}

const styles = StyleSheet.create({
  viewer: {
    flex: 1,
  },
});
