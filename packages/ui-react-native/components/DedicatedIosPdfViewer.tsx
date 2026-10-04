import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import type { DocumentEngine } from "@papyrus-sdk/types";
import { PapyrusPdfDocumentView } from "@papyrus-sdk/engine-native";
import { resolvePageTapChromeVisibility } from "./mobileChromeInteraction";
import { getDedicatedAndroidPdfEngineId } from "./DedicatedAndroidPdfViewer";
import {
  resolveNativePdfPageChange,
  resolveNativePdfVisiblePages,
  resolveNativePdfZoomChange,
} from "./nativePdfViewerEvents";

const MOBILE_CHROME_HIDE_DELTA = 28;
const MOBILE_CHROME_SHOW_DELTA = 22;
const MOBILE_CHROME_SHOW_DELAY_MS = 180;
const MOBILE_CHROME_TOP_RESET = 16;
const MIN_VISIBLE_PAGE_RATIO = 0.03;

type DedicatedIosPdfViewerProps = {
  engine: DocumentEngine;
  maxPageWidth?: number;
};

export default function DedicatedIosPdfViewer({
  engine,
  maxPageWidth,
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
      selectionActive,
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "stretch" },
  viewer: { flex: 1, width: "100%" },
});
