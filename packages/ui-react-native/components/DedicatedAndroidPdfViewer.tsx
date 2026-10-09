import {getStrings} from "../mobileStrings";
import {getNearbyPdfNotes} from "./pdfAnnotationNoteGroups";
import PdfNoteChooser from "./PdfNoteChooser";
import type {Annotation} from "@papyrus-sdk/types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {contextualizePdfAnnotation, useViewerStore} from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import { PapyrusPdfDocumentView } from "@papyrus-sdk/engine-native";
import { resolvePageTapChromeVisibility } from "./mobileChromeInteraction";
import { shouldDismissSelectionOnContentInteraction } from "./selectionContentInteraction";
import { resolveMaxPageWidth } from "./pdfPageMetrics";

const TEXT_MARKUP_TOOLS = new Set(["highlight", "underline", "squiggly", "strikeout"]);

const MOBILE_CHROME_HIDE_DELTA = 28;
const MOBILE_CHROME_SHOW_DELTA = 22;
const MOBILE_CHROME_SHOW_DELAY_MS = 180;
const MOBILE_CHROME_TOP_RESET = 16;

type NativeEngineBackdoor = {
  getNativeEngineId?: () => string;
};

type DedicatedAndroidPdfViewerProps = {
  engine: DocumentEngine;
  documentId?: string;
  maxPageWidth?: number;
  onTextSelected?: (selection: {text:string;pageIndex:number}) => void;
  onDefineSelection?: (selection: {text:string;pageIndex:number}) => void;
  defineSelectionMode?: "selection" | "single-word";
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
  documentId,
  maxPageWidth,
  onTextSelected,
  onDefineSelection,
  defineSelectionMode,
}: DedicatedAndroidPdfViewerProps) {
  const t = getStrings(useViewerStore(state=>state.locale));
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const zoom = useViewerStore((state) => state.zoom);
  const currentPage = useViewerStore((state) => state.currentPage);
  const activeTool = useViewerStore((state) => state.activeTool);
  const annotationColor = useViewerStore((state) => state.annotationColor);
  const inkStrokeWidth = useViewerStore((state) => state.inkStrokeWidth);
  const annotationOpacity = useViewerStore((state) => state.annotationOpacity);
  const searchResults = useViewerStore((state) => state.searchResults);
  const annotationNavigationRequest = useViewerStore(state => state.annotationNavigationRequest);
  const annotations = useViewerStore((state) => state.annotations);
  const [pendingNotes,setPendingNotes] = useState<Annotation[]>([]);
  const handleAnnotationTap = (id:string) => {
    const nearby=getNearbyPdfNotes(annotations,id);
    if(nearby.length<2){setSelectedAnnotation(id);return;}
    setPendingNotes(nearby);
  };
  const viewMode = useViewerStore((state) => state.viewMode);
  const mobileChromeVisible = useViewerStore(
    (state) => state.mobileChromeVisible
  );
  const selectedAnnotationId = useViewerStore(
    (state) => state.selectedAnnotationId
  );
  const nativeViewMode = viewMode === "single" ? "single" : "continuous";
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const beginAnnotationDraft = useViewerStore(state=>state.beginAnnotationDraft);
  const addAnnotation = useViewerStore((state) => state.addAnnotation);
  const setSelectedAnnotation = useViewerStore((state) => state.setSelectedAnnotation);
  const engineId = getDedicatedAndroidPdfEngineId(engine);
  const resolvedMaxPageWidth = resolveMaxPageWidth(maxPageWidth);
  const cappedViewerStyle = resolvedMaxPageWidth
    ? {
        width: "100%" as const,
        maxWidth: resolvedMaxPageWidth,
        alignSelf: "center" as const,
      }
    : undefined;

  const [selection, setSelection] = useState<SelectionState>(null);
  const selectionRef = useRef<SelectionState>(null);

  // Deduplicate visiblePages events to prevent JS/native loop in page gaps
  const lastVisiblePagesKeyRef = useRef("");

  // Mobile chrome auto-hide tracking (replicates Viewer.tsx trackMobileChromeByOffset)
  const lastScrollOffsetYRef = useRef(0);
  const scrollDownAccumRef = useRef(0);
  const scrollUpAccumRef = useRef(0);
  const pendingChromeShowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chromeVisibleRef = useRef(true);
  const lastZoomChangedAtRef = useRef<number | null>(null);

  useEffect(() => {
    chromeVisibleRef.current = mobileChromeVisible;
  }, [mobileChromeVisible]);

  const clearPendingChromeShow = useCallback(() => {
    if (pendingChromeShowTimeoutRef.current) {
      clearTimeout(pendingChromeShowTimeoutRef.current);
      pendingChromeShowTimeoutRef.current = null;
    }
  }, []);

  const setMobileChromeVisible = useCallback((visible: boolean, reason: string) => {
    if (chromeVisibleRef.current === visible) return;
    chromeVisibleRef.current = visible;
    setDocumentState({ mobileChromeVisible: visible });
  }, [setDocumentState]);

  const trackMobileChromeByOffset = useCallback((offsetY: number, reasonPrefix: string) => {
    const safeOffset = Math.max(0, offsetY);
    const delta = safeOffset - lastScrollOffsetYRef.current;
    lastScrollOffsetYRef.current = safeOffset;

    if (safeOffset <= MOBILE_CHROME_TOP_RESET) {
      scrollDownAccumRef.current = 0;
      scrollUpAccumRef.current = 0;
      clearPendingChromeShow();
      setMobileChromeVisible(true, `${reasonPrefix}.top`);
      return;
    }

    if (Math.abs(delta) < 1) return;

    if (delta > 0) {
      scrollDownAccumRef.current += delta;
      scrollUpAccumRef.current = 0;
      clearPendingChromeShow();
      if (
        scrollDownAccumRef.current >= MOBILE_CHROME_HIDE_DELTA &&
        chromeVisibleRef.current
      ) {
        scrollDownAccumRef.current = 0;
        setMobileChromeVisible(false, `${reasonPrefix}.hide`);
      }
      return;
    }

    scrollUpAccumRef.current += -delta;
    scrollDownAccumRef.current = 0;
    if (
      scrollUpAccumRef.current >= MOBILE_CHROME_SHOW_DELTA &&
      !chromeVisibleRef.current
    ) {
      if (!pendingChromeShowTimeoutRef.current) {
        pendingChromeShowTimeoutRef.current = setTimeout(() => {
          pendingChromeShowTimeoutRef.current = null;
          scrollUpAccumRef.current = 0;
          if (!chromeVisibleRef.current) {
            setMobileChromeVisible(true, `${reasonPrefix}.show`);
          }
        }, MOBILE_CHROME_SHOW_DELAY_MS);
      }
    }
  }, [clearPendingChromeShow, setMobileChromeVisible]);

  useEffect(() => {
    return () => {
      clearPendingChromeShow();
    };
  }, [clearPendingChromeShow]);

  const applySelection = useCallback((type: "highlight" | "underline" | "squiggly" | "strikeout" | "comment") => {
    const sel = selectionRef.current;
    if (!sel || !sel.rects || sel.rects.length === 0) return;
    const bounds = sel.rects.reduce((acc, r) => ({
      x: Math.min(acc.x, r.x),
      y: Math.min(acc.y, r.y),
      width: Math.max(acc.x + acc.width, r.x + r.width) - Math.min(acc.x, r.x),
      height: Math.max(acc.y + acc.height, r.y + r.height) - Math.min(acc.y, r.y),
    }), { x: 1, y: 1, width: 0, height: 0 });
    (type === "comment" ? beginAnnotationDraft : addAnnotation)(contextualizePdfAnnotation({
      id: Math.random().toString(36).slice(2, 9),
      pageIndex: sel.pageIndex,
      type,
      rect: bounds,
      rects: sel.rects,
      color: annotationColor,
      content: sel.text,
      createdAt: Date.now(),
    },documentId));
    setSelection(null);
    selectionRef.current = null;
  }, [addAnnotation, beginAnnotationDraft, annotationColor, documentId]);

  return (
    <View style={styles.container}>
      <PdfNoteChooser notes={pendingNotes} title={t.annotationNote} cancel={t.cancel} onClose={()=>setPendingNotes([])} onSelect={id=>{setPendingNotes([]);setSelectedAnnotation(id);}} />
      <PapyrusPdfDocumentView
        style={[styles.viewer, cappedViewerStyle]}
        engineId={engineId}
        annotationLabels={{copy:t.copy,highlight:t.annotationHighlight,underline:t.annotationUnderline,strikeout:t.annotationStrikeout,comment:t.annotationNote}}
        defineLabel={t.define}
        defineEnabled={!!onDefineSelection}
        defineSelectionMode={defineSelectionMode}
        onDefineSelection={event => onDefineSelection?.(event.nativeEvent)}
        onAnnotateSelection={event => {
          selectionRef.current = event.nativeEvent;
          applySelection(event.nativeEvent.style);
        }}
        pageTheme={pageTheme}
        zoom={zoom}
        currentPage={currentPage}
        activeTool={activeTool}
        annotationColor={annotationColor}
        inkStrokeWidth={inkStrokeWidth}
        annotationOpacity={annotationOpacity}
        searchResults={searchResults}
        annotationNavigationRequest={annotationNavigationRequest}
        annotations={annotations.filter(a => !a.anchor?.documentId || a.anchor.documentId === documentId)}
        selectionActive={!!selection}
        viewMode={nativeViewMode}
        onPageChange={(event) => {
          setDocumentState({ currentPage: event.nativeEvent.page });
        }}
        onZoomChange={(event) => {
          lastZoomChangedAtRef.current = Date.now();
          setDocumentState({ zoom: event.nativeEvent.zoom });
        }}
        onVisiblePagesChange={(event) => {
          const pages = event.nativeEvent.pages ?? [];

          // Filter out micro-visibility near gaps and build stable key
          const stablePages = pages.filter(
            (page: { pageIndex: number; visibleRatio: number }) =>
              page.visibleRatio >= 0.03
          );

          // Do not update store with empty visiblePages when in a page gap.
          // This prevents JS/native loop and flicker.
          if (stablePages.length === 0) {
            return;
          }

          const key = stablePages
            .map(
              (page: { pageIndex: number; visibleRatio: number }) =>
                `${page.pageIndex}:${Math.round(page.visibleRatio * 100)}`
            )
            .join("|");

          if (key === lastVisiblePagesKeyRef.current) {
            return;
          }

          lastVisiblePagesKeyRef.current = key;
          setDocumentState({ visiblePages: stablePages });
        }}
        onAnnotationCreated={(event) => {
          (event.nativeEvent.type === "comment" || event.nativeEvent.type === "text" ? beginAnnotationDraft : addAnnotation)(contextualizePdfAnnotation(event.nativeEvent,documentId));
        }}
        onAnnotationTap={(event) => {
          handleAnnotationTap(event.nativeEvent.id);
        }}
        onTap={() => {
          if (
            shouldDismissSelectionOnContentInteraction({
              selectionActive: selectionRef.current !== null,
              interaction: "tap",
            })
          ) {
            setSelection(null);
            selectionRef.current = null;
          }
          const nextVisible = resolvePageTapChromeVisibility({
            chromeVisible: chromeVisibleRef.current,
            selectionActive: selectionRef.current !== null,
            annotationHit: selectedAnnotationId !== null,
            pinchActive:
              lastZoomChangedAtRef.current !== null &&
              Date.now() - lastZoomChangedAtRef.current < 400,
            toolActive: activeTool !== "select",
          });
          if (nextVisible !== null) {
            setMobileChromeVisible(nextVisible, "native.page.tap");
          }
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
          onTextSelected?.({text,pageIndex});
          if (TEXT_MARKUP_TOOLS.has(activeTool)) {
            applySelection(activeTool as "highlight" | "underline" | "squiggly" | "strikeout");
          }
        }}
        onScroll={(event) => {
          if (
            shouldDismissSelectionOnContentInteraction({
              selectionActive: selectionRef.current !== null,
              interaction: "scroll",
            })
          ) {
            setSelection(null);
            selectionRef.current = null;
          }
          trackMobileChromeByOffset(event.nativeEvent.offsetY, "native.scroll");
        }}
      />

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
});
