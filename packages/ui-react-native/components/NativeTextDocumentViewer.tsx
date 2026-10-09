import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  PapyrusTextDocumentView,
  type PapyrusTextDocumentViewProps,
} from "@papyrus-sdk/engine-native";
import { createContextualAnnotation, validateAnnotationAnchor, papyrusEvents, useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine, PapyrusEventType, TextRangeSelection } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";

type TextEngineAccess = DocumentEngine & {
  getNativeTextEngineId?: () => string | null;
  getNativeTextDocumentGeneration?: () => number;
  getTextLength?: () => number;
  getCurrentTextOffset?: () => number;
};

type Props = {
  engine: DocumentEngine;
  documentId?: string;
  onTextRangeSelected?: (selection: TextRangeSelection) => void;
  onDefineSelection?: (selection: TextRangeSelection) => void;
  defineSelectionMode?: "selection" | "single-word";
};

export default function NativeTextDocumentViewer({
  engine,
  documentId,
  onTextRangeSelected,
  onDefineSelection,
  defineSelectionMode = "selection",
}: Props) {
  const nativeEngine = engine as TextEngineAccess;
  const engineId = nativeEngine.getNativeTextEngineId?.() ?? undefined;
  const documentGeneration = nativeEngine.getNativeTextDocumentGeneration?.() ?? 0;
  const measuredTextLength = nativeEngine.getTextLength?.() ?? 0;
  const annotations = useViewerStore((state) => state.annotations);
  const scopedAnnotations = useMemo(() => annotations.filter(annotation => !annotation.anchor || (validateAnnotationAnchor(annotation.anchor) && annotation.anchor.kind === "text-range" && (!annotation.anchor.documentId || annotation.anchor.documentId === documentId))), [annotations, documentId]);
  const beginAnnotationDraft = useViewerStore(state=>state.beginAnnotationDraft);
  const addAnnotation = useViewerStore((state) => state.addAnnotation);
  const setSelectedAnnotation = useViewerStore((state) => state.setSelectedAnnotation);
  const annotationColor = useViewerStore((state) => state.annotationColor);
  const annotationOpacity = useViewerStore((state) => state.annotationOpacity);
  const locale = useViewerStore((state) => state.locale);
  const insets = usePapyrusSafeAreaInsets();
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const zoom = useViewerStore(state=>state.zoom);
  const uiTheme = useViewerStore((state) => state.uiTheme);
  const textLength = useViewerStore((state) => state.textLength);
  const currentTextOffset = useViewerStore((state) => state.currentTextOffset);
  const scrollToTextOffsetSignal = useViewerStore(
    (state) => state.scrollToTextOffsetSignal,
  );
  const textNavigationRequest = useViewerStore(state=>state.textNavigationRequest);
  const textSearchResults = useViewerStore((state) => state.textSearchResults);
  const activeSearchIndex = useViewerStore((state) => state.activeSearchIndex);
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const t = getStrings(locale);

  useEffect(() => {
    if (!engineId || measuredTextLength <= 0) return;
    setDocumentState({
      textLength: measuredTextLength,
      pageCount: 1,
      currentPage: 1,
      isLoaded: true,
    });
  }, [engineId, measuredTextLength, setDocumentState]);

  const viewProps = useMemo(
    () => ({
      engineId,
      annotations: scopedAnnotations,
      annotationLabels: { annotate: t.annotate, highlight: t.annotationHighlight, underline: t.annotationUnderline, strikeout: t.annotationStrikeout, comment: t.annotationNote },
      onAnnotationTap: (event: Parameters<NonNullable<PapyrusTextDocumentViewProps["onAnnotationTap"]>>[0]) => setSelectedAnnotation(event.nativeEvent.id),
      onAnnotateSelection: (event: Parameters<NonNullable<PapyrusTextDocumentViewProps["onAnnotateSelection"]>>[0]) => {
        const selection = event.nativeEvent;
        if (!selection.text || selection.end <= selection.start) return;
        (selection.style === "comment" ? beginAnnotationDraft : addAnnotation)(createContextualAnnotation({
          id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`, pageIndex: 0,
          anchor: { version: 1, kind: "text-range", encoding: "utf-16", documentId, quote: selection.text, start: selection.start, end: selection.end, prefix: selection.prefix, suffix: selection.suffix },
          style: selection.style === "comment" ? "highlight" : selection.style,
          note: selection.style === "comment" ? "" : undefined, color: annotationColor, opacity: annotationOpacity,
        }));
      },
      documentGeneration,
      textLength: textLength || measuredTextLength,
      currentTextOffset,
      scrollToTextOffsetSignal,
      textNavigationRequest,
      searchResults: textSearchResults,
      activeSearchIndex,
      pageTheme,
      uiTheme,
      fontSize: 18 * zoom,
      lineHeight: 28 * zoom,
      pageMargin: 20,
      defineLabel: t.define,
      defineSelectionMode,
      onTextOffsetChange: (event: Parameters<NonNullable<PapyrusTextDocumentViewProps["onTextOffsetChange"]>>[0]) => {
        setDocumentState({ currentTextOffset: event.nativeEvent.offset });
      },
      onTextRangeSelected: (event: Parameters<NonNullable<PapyrusTextDocumentViewProps["onTextRangeSelected"]>>[0]) => {
        const selection = event.nativeEvent;
        if (!selection.text || selection.end <= selection.start) return;
        papyrusEvents.emit(PapyrusEventType.TEXT_RANGE_SELECTED, selection);
        onTextRangeSelected?.(selection);
      },
      onDefineSelection: (event: Parameters<NonNullable<PapyrusTextDocumentViewProps["onDefineSelection"]>>[0]) => {
        onDefineSelection?.(event.nativeEvent);
      },
    }) satisfies PapyrusTextDocumentViewProps,
    [
      scopedAnnotations, beginAnnotationDraft, addAnnotation, setSelectedAnnotation, documentId, annotationColor, annotationOpacity, t,
      activeSearchIndex,
      currentTextOffset,
      documentGeneration,
      defineSelectionMode,
      engineId,
      measuredTextLength,
      onDefineSelection,
      onTextRangeSelected,
      pageTheme,
      scrollToTextOffsetSignal,
      setDocumentState,
      t.define,
      textLength,
      textSearchResults,
      textNavigationRequest,
      uiTheme, zoom,
    ],
  );

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + MOBILE_CHROME_METRICS.topbarHeight },
      ]}
    >
      <PapyrusTextDocumentView
        key={`${engineId ?? "pending"}:${documentGeneration}`}
        {...viewProps}
        style={styles.nativeView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  nativeView: { flex: 1 },
});
