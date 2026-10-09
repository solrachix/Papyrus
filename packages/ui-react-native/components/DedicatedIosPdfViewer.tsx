import {getNearbyPdfNotes} from "./pdfAnnotationNoteGroups";
import PdfNoteChooser from "./PdfNoteChooser";
import type {Annotation} from "@papyrus-sdk/types";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { contextualizePdfAnnotation, useViewerStore } from "@papyrus-sdk/core";
import type { DocumentEngine } from "@papyrus-sdk/types";
import { PapyrusPdfDocumentView } from "@papyrus-sdk/engine-native";
import { getStrings } from "../mobileStrings";
import { handleNativeInkPickerVisibility } from "./nativeInkSession";
import {
  deleteAnnotationAndClearSelection,
  resolveMarkupAnnotationDeleteFallback,
} from "./annotationDeletion";
import { resolvePageTapChromeVisibility } from "./mobileChromeInteraction";
import { shouldShowDefineSelection } from "./nativePdfViewerMode";
import { getDedicatedAndroidPdfEngineId } from "./DedicatedAndroidPdfViewer";
import {
  resolveNativePdfPageChange,
  resolveNativePdfTextSelection,
  resolveNativePdfVisiblePages,
  resolveNativePdfZoomChange,
  type NativePdfTextSelection,
} from "./nativePdfViewerEvents";

const MOBILE_CHROME_HIDE_DELTA = 28;
const MOBILE_CHROME_SHOW_DELTA = 22;
const MOBILE_CHROME_SHOW_DELAY_MS = 180;
const MOBILE_CHROME_TOP_RESET = 16;
const MIN_VISIBLE_PAGE_RATIO = 0.03;
const supportsNativeEditMenu =
  Number.parseInt(String(Platform.Version), 10) >= 16;

type DedicatedIosPdfViewerProps = {
  engine: DocumentEngine;
  documentId?: string;
  maxPageWidth?: number;
  onTextSelected?: (payload: { text: string; pageIndex: number }) => void;
  onDefineSelection?: (payload: { text: string; pageIndex: number }) => void;
  defineSelectionMode?: "selection" | "single-word";
};

export default function DedicatedIosPdfViewer({
  engine,
  documentId,
  maxPageWidth,
  onTextSelected,
  onDefineSelection,
  defineSelectionMode = "selection",
}: DedicatedIosPdfViewerProps) {
  const locale = useViewerStore((state) => state.locale);
  const t = getStrings(locale);
  const pageCount = useViewerStore((state) => state.pageCount);
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const zoom = useViewerStore((state) => state.zoom);
  const currentPage = useViewerStore((state) => state.currentPage);
  const searchResults = useViewerStore((state) => state.searchResults);
  const activeSearchIndex = useViewerStore((state) => state.activeSearchIndex);
  const viewMode = useViewerStore((state) => state.viewMode);
  const selectionActive = useViewerStore((state) => state.selectionActive);
  const activeTool = useViewerStore((state) => state.activeTool);
  const activeDrawToolPreset = useViewerStore(
    (state) => state.activeDrawToolPreset
  );
  const inkStrokeWidth = useViewerStore((state) => state.inkStrokeWidth);
  const annotationNavigationRequest = useViewerStore(state => state.annotationNavigationRequest);
  const annotations = useViewerStore((state) => state.annotations);
  const [pendingNotes,setPendingNotes] = useState<Annotation[]>([]);
  const handleAnnotationTap = (id:string) => {
    const nearby=getNearbyPdfNotes(annotations,id);
    if(nearby.length<2){setSelectedAnnotation(id);return;}
    setPendingNotes(nearby);
  };
  const annotationColor = useViewerStore((state) => state.annotationColor);
  const annotationSelectionColor = useViewerStore((state) => state.accentColor);
  const annotationOpacity = useViewerStore((state) => state.annotationOpacity);
  const selectedAnnotationId = useViewerStore(
    (state) => state.selectedAnnotationId
  );
  const beginAnnotationDraft = useViewerStore(state=>state.beginAnnotationDraft);
  const addAnnotation = useViewerStore((state) => state.addAnnotation);
  const removeAnnotation = useViewerStore((state) => state.removeAnnotation);
  const setSelectedAnnotation = useViewerStore(
    (state) => state.setSelectedAnnotation
  );
  const mobileChromeVisible = useViewerStore(
    (state) => state.mobileChromeVisible
  );
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const commitInkStrokesForPage = useViewerStore(
    (state) => state.commitInkStrokesForPage
  );
  const engineId = getDedicatedAndroidPdfEngineId(engine);
  const nativeViewMode = viewMode === "single" ? "single" : "continuous";
  const fallbackDeleteAnnotation = resolveMarkupAnnotationDeleteFallback(
    annotations,
    selectedAnnotationId,
    supportsNativeEditMenu
  );
  const resolvedMaxPageWidth =
    typeof maxPageWidth === "number" &&
    Number.isFinite(maxPageWidth) &&
    maxPageWidth > 0
      ? maxPageWidth
      : undefined;

  const chromeVisibleRef = useRef(mobileChromeVisible);
  const lastScrollOffsetYRef = useRef(0);
  const scrollDownAccumRef = useRef(0);
  const scrollUpAccumRef = useRef(0);
  const pendingChromeShowTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const lastZoomChangedAtRef = useRef<number | null>(null);
  const lastVisiblePagesKeyRef = useRef("");
  const [selection, setSelection] = useState<NativePdfTextSelection | null>(null);
  const selectionRef = useRef<NativePdfTextSelection | null>(null);

  useEffect(() => {
    const pickerActive = supportsNativeEditMenu && activeTool === "ink";
    setDocumentState({ nativeInkToolPickerActive: pickerActive });
    return () => {
      if (pickerActive) {
        setDocumentState({ nativeInkToolPickerActive: false });
      }
    };
  }, [activeTool, setDocumentState]);

  useEffect(() => {
    chromeVisibleRef.current = mobileChromeVisible;
  }, [mobileChromeVisible]);

  const clearPendingChromeShow = useCallback(() => {
    if (!pendingChromeShowTimeoutRef.current) return;
    clearTimeout(pendingChromeShowTimeoutRef.current);
    pendingChromeShowTimeoutRef.current = null;
  }, []);

  const setMobileChromeVisible = useCallback(
    (visible: boolean) => {
      if (chromeVisibleRef.current === visible) return;
      chromeVisibleRef.current = visible;
      setDocumentState({ mobileChromeVisible: visible });
    },
    [setDocumentState]
  );

  const updateSelection = useCallback(
    (nextSelection: NativePdfTextSelection | null) => {
      selectionRef.current = nextSelection;
      setSelection(nextSelection);
    },
    []
  );

  const handleTextSelectionChange = useCallback(
    (event: {
      nativeEvent?: {
        text?: string;
        pageIndex?: number;
        rects?: { x: number; y: number; width: number; height: number }[];
      };
    }) => {
      const nextSelection = resolveNativePdfTextSelection(event.nativeEvent);
      updateSelection(nextSelection);
      if (nextSelection) {
        const { text, pageIndex } = nextSelection;
        onTextSelected?.({ text, pageIndex });
      } else {
        setSelectedAnnotation(null);
      }
    },
    [onTextSelected, setSelectedAnnotation, updateSelection]
  );

  const defineSelection = useCallback(() => {
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;
    onDefineSelection?.({
      text: currentSelection.text,
      pageIndex: currentSelection.pageIndex,
    });
    updateSelection(null);
  }, [onDefineSelection, updateSelection]);

  const handleNativeDefineSelection = useCallback(
    (event: {
      nativeEvent?: { text?: unknown; pageIndex?: unknown };
    }) => {
      const text = event.nativeEvent?.text;
      const pageIndex = event.nativeEvent?.pageIndex;
      if (
        typeof text !== "string" ||
        text.length === 0 ||
        typeof pageIndex !== "number" ||
        !Number.isInteger(pageIndex) ||
        pageIndex < 0
      ) {
        return;
      }

      onDefineSelection?.({ text, pageIndex });
      updateSelection(null);
    },
    [onDefineSelection, updateSelection]
  );

  const handleInkToolPickerVisibilityChange = useCallback(
    (event: { nativeEvent?: { visible?: unknown } }) => {
      handleNativeInkPickerVisibility(
        event.nativeEvent?.visible === true,
        useViewerStore.getState()
      );
    },
    []
  );

  const trackMobileChromeByOffset = useCallback(
    (offsetY: number) => {
      if (pageCount <= 0) return;
      const safeOffset = Math.max(0, offsetY);
      const delta = safeOffset - lastScrollOffsetYRef.current;
      lastScrollOffsetYRef.current = safeOffset;

      if (safeOffset <= MOBILE_CHROME_TOP_RESET) {
        scrollDownAccumRef.current = 0;
        scrollUpAccumRef.current = 0;
        clearPendingChromeShow();
        setMobileChromeVisible(true);
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
          setMobileChromeVisible(false);
        }
        return;
      }

      scrollUpAccumRef.current += -delta;
      scrollDownAccumRef.current = 0;
      if (
        scrollUpAccumRef.current >= MOBILE_CHROME_SHOW_DELTA &&
        !chromeVisibleRef.current &&
        !pendingChromeShowTimeoutRef.current
      ) {
        pendingChromeShowTimeoutRef.current = setTimeout(() => {
          pendingChromeShowTimeoutRef.current = null;
          scrollUpAccumRef.current = 0;
          if (!chromeVisibleRef.current) setMobileChromeVisible(true);
        }, MOBILE_CHROME_SHOW_DELAY_MS);
      }
    },
    [clearPendingChromeShow, pageCount, setMobileChromeVisible]
  );

  useEffect(
    () => () => clearPendingChromeShow(),
    [clearPendingChromeShow]
  );

  const handleVisiblePagesChange = useCallback(
    (event: { nativeEvent?: { pages?: unknown } }) => {
      const pages = resolveNativePdfVisiblePages(
        event.nativeEvent?.pages as
          | Array<{ pageIndex?: number; visibleRatio?: number }>
          | undefined
      ).filter((page) => page.visibleRatio >= MIN_VISIBLE_PAGE_RATIO);
      if (pages.length === 0) return;

      const key = pages
        .map(
          (page) => `${page.pageIndex}:${Math.round(page.visibleRatio * 100)}`
        )
        .join("|");
      if (key === lastVisiblePagesKeyRef.current) return;
      lastVisiblePagesKeyRef.current = key;
      setDocumentState({ visiblePages: pages });
    },
    [setDocumentState]
  );

  const handleScroll = useCallback(
    (event: { nativeEvent?: { offsetY?: number } }) => {
      trackMobileChromeByOffset(event.nativeEvent?.offsetY ?? 0);
    },
    [trackMobileChromeByOffset]
  );

  const handleTap = useCallback(() => {
    setSelectedAnnotation(null);
    const nextVisible = resolvePageTapChromeVisibility({
      chromeVisible: chromeVisibleRef.current,
      selectionActive: selectionActive || selectionRef.current !== null,
      pinchActive:
        lastZoomChangedAtRef.current !== null &&
        Date.now() - lastZoomChangedAtRef.current < 400,
      toolActive: activeTool !== "select",
    });
    if (nextVisible !== null) setMobileChromeVisible(nextVisible);
  }, [activeTool, selectionActive, setMobileChromeVisible, setSelectedAnnotation]);

  const handleDeleteAnnotation = useCallback(
    (annotationId: string) => {
      deleteAnnotationAndClearSelection(
        annotationId,
        removeAnnotation,
        setSelectedAnnotation
      );
    },
    [removeAnnotation, setSelectedAnnotation]
  );

  const cappedViewerStyle = resolvedMaxPageWidth
    ? {
        width: "100%" as const,
        maxWidth: resolvedMaxPageWidth,
        alignSelf: "center" as const,
      }
    : undefined;

  return (
    <View style={styles.container}>
      <PdfNoteChooser notes={pendingNotes} title={t.annotationNote} cancel={t.cancel} onClose={()=>setPendingNotes([])} onSelect={id=>{setPendingNotes([]);setSelectedAnnotation(id);}} />
      <PapyrusPdfDocumentView
        style={[styles.viewer, cappedViewerStyle]}
        engineId={engineId}
        pageTheme={pageTheme}
        zoom={zoom}
        currentPage={currentPage}
        searchResults={searchResults}
        activeSearchIndex={activeSearchIndex}
        annotationNavigationRequest={annotationNavigationRequest}
        annotations={annotations.filter(a => !a.anchor?.documentId || a.anchor.documentId === documentId)}
        activeTool={activeTool}
        activeDrawToolPreset={activeDrawToolPreset}
        inkStrokeWidth={inkStrokeWidth}
        annotationColor={annotationColor}
        annotationSelectionColor={annotationSelectionColor}
        annotationOpacity={annotationOpacity}
        selectedAnnotationId={selectedAnnotationId}
        viewMode={nativeViewMode}
        selectionActive={selection !== null}
        onPageChange={(event) => {
          const update = resolveNativePdfPageChange(
            event.nativeEvent.page,
            pageCount
          );
          if (update) {
            engine.goToPage(update.currentPage);
            setDocumentState(update);
          }
        }}
        onZoomChange={(event) => {
          const update = resolveNativePdfZoomChange(event.nativeEvent.zoom);
          if (!update) return;
          lastZoomChangedAtRef.current = Date.now();
          engine.setZoom(update.zoom);
          setDocumentState(update);
        }}
        onVisiblePagesChange={handleVisiblePagesChange}
        onScroll={handleScroll}
        onTap={handleTap}
        onTextSelected={handleTextSelectionChange}
        copyLabel={t.copy}
        selectAllLabel={t.selectAll}
        defineLabel={t.define}
        defineSelectionMode={defineSelectionMode}
        annotateLabel={t.annotate}
        annotationHighlightLabel={t.annotationHighlight}
        annotationUnderlineLabel={t.annotationUnderline}
        annotationStrikeoutLabel={t.annotationStrikeout}
        annotationSquigglyLabel={t.annotationSquiggly}
        annotationNoteLabel={t.annotationNote}
        annotationDeleteLabel={t.deleteAnnotation}
        onDefineSelection={
          onDefineSelection ? handleNativeDefineSelection : undefined
        }
        onAnnotationCreated={(event) => (event.nativeEvent.type === "comment" || event.nativeEvent.type === "text" ? beginAnnotationDraft : addAnnotation)(contextualizePdfAnnotation(event.nativeEvent,documentId))}
        onAnnotationTap={(event) =>
          handleAnnotationTap(event.nativeEvent.id)
        }
        onAnnotationDelete={(event) =>
          handleDeleteAnnotation(event.nativeEvent.id)
        }
        onAnnotationDeselected={() => setSelectedAnnotation(null)}
        onInkDrawingCommitted={(event) => {
          const pageIndex = event.nativeEvent?.pageIndex;
          const strokes = event.nativeEvent?.strokes;
          if (
            typeof pageIndex !== "number" ||
            !Number.isInteger(pageIndex) ||
            pageIndex < 0 ||
            !Array.isArray(strokes)
          ) {
            return;
          }
          commitInkStrokesForPage(pageIndex, strokes);
        }}
        onInkToolPickerVisibilityChange={handleInkToolPickerVisibilityChange}
      />
      {selection &&
        !supportsNativeEditMenu &&
        onDefineSelection &&
        shouldShowDefineSelection(selection.text, defineSelectionMode) && (
        <View style={styles.selectionFallback} pointerEvents="box-none">
          <Pressable
            onPress={defineSelection}
            style={styles.fallbackButton}
            accessibilityRole="button"
            accessibilityLabel={t.define}
          >
            <Text style={styles.fallbackButtonText}>{t.define}</Text>
          </Pressable>
        </View>
      )}
      {fallbackDeleteAnnotation && (
        <View
          style={styles.annotationDeleteFallback}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() =>
              handleDeleteAnnotation(fallbackDeleteAnnotation.id)
            }
            style={styles.annotationDeleteButton}
            accessibilityRole="button"
            accessibilityLabel={t.deleteAnnotation}
            hitSlop={8}
          >
            <Text style={styles.annotationDeleteButtonText}>
              {t.deleteAnnotation}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },
  viewer: { flex: 1, width: "100%" },
  selectionFallback: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 120,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  fallbackButton: {
    backgroundColor: "rgba(30, 30, 30, 0.92)",
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  fallbackButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  annotationDeleteFallback: {
    position: "absolute",
    left: 0,
    right: 16,
    bottom: 120,
    alignItems: "flex-end",
    justifyContent: "center",
    zIndex: 51,
  },
  annotationDeleteButton: {
    backgroundColor: "#b91c1c",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  annotationDeleteButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
