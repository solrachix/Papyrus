import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { useViewerStore } from "@papyrus-sdk/core";
import type { DocumentEngine } from "@papyrus-sdk/types";
import { PapyrusPdfDocumentView } from "@papyrus-sdk/engine-native";
import { IconCopy } from "../icons";
import { copySelectionText } from "./clipboard";
import { resolvePageTapChromeVisibility } from "./mobileChromeInteraction";
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

type DedicatedIosPdfViewerProps = {
  engine: DocumentEngine;
  maxPageWidth?: number;
  onTextSelected?: (payload: { text: string; pageIndex: number }) => void;
  onDefineSelection?: (payload: { text: string; pageIndex: number }) => void;
};

export default function DedicatedIosPdfViewer({
  engine,
  maxPageWidth,
  onTextSelected,
  onDefineSelection,
}: DedicatedIosPdfViewerProps) {
  const pageCount = useViewerStore((state) => state.pageCount);
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const zoom = useViewerStore((state) => state.zoom);
  const currentPage = useViewerStore((state) => state.currentPage);
  const viewMode = useViewerStore((state) => state.viewMode);
  const selectionActive = useViewerStore((state) => state.selectionActive);
  const activeTool = useViewerStore((state) => state.activeTool);
  const mobileChromeVisible = useViewerStore(
    (state) => state.mobileChromeVisible
  );
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const engineId = getDedicatedAndroidPdfEngineId(engine);
  const nativeViewMode = viewMode === "single" ? "single" : "continuous";
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
      }
    },
    [onTextSelected, updateSelection]
  );

  const copySelection = useCallback(async () => {
    const selection = selectionRef.current;
    if (!selection) return;
    const copied = await copySelectionText(selection.text, Clipboard);
    if (copied) updateSelection(null);
  }, [updateSelection]);

  const defineSelection = useCallback(() => {
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;
    onDefineSelection?.({
      text: currentSelection.text,
      pageIndex: currentSelection.pageIndex,
    });
    updateSelection(null);
  }, [onDefineSelection, updateSelection]);

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
    const nextVisible = resolvePageTapChromeVisibility({
      chromeVisible: chromeVisibleRef.current,
      selectionActive: selectionActive || selectionRef.current !== null,
      pinchActive:
        lastZoomChangedAtRef.current !== null &&
        Date.now() - lastZoomChangedAtRef.current < 400,
      toolActive: activeTool !== "select",
    });
    if (nextVisible !== null) setMobileChromeVisible(nextVisible);
  }, [activeTool, selectionActive, setMobileChromeVisible]);

  const cappedViewerStyle = resolvedMaxPageWidth
    ? {
        width: "100%" as const,
        maxWidth: resolvedMaxPageWidth,
        alignSelf: "center" as const,
      }
    : undefined;

  return (
    <View style={styles.container}>
      <PapyrusPdfDocumentView
        style={[styles.viewer, cappedViewerStyle]}
        engineId={engineId}
        pageTheme={pageTheme}
        zoom={zoom}
        currentPage={currentPage}
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
      />
      {selection && (
        <View style={styles.selectionToolbar} pointerEvents="box-none">
          <View style={styles.toolbarContent}>
            <Pressable
              onPress={() => void copySelection()}
              style={styles.toolbarButton}
              accessibilityRole="button"
              accessibilityLabel="Copy selected text"
            >
              <IconCopy size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.toolbarButtonText}>Copy</Text>
            </Pressable>
            {onDefineSelection && (
              <Pressable
                onPress={defineSelection}
                style={styles.toolbarButton}
                accessibilityRole="button"
                accessibilityLabel="Define selected text"
              >
                <Text style={styles.toolbarButtonText}>Define</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },
  viewer: { flex: 1, width: "100%" },
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
    minWidth: 76,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  toolbarButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
