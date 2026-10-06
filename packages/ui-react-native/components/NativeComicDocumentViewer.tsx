import React, { useEffect, useMemo } from "react";
import { Alert, StyleSheet, View } from "react-native";
import {
  PapyrusComicDocumentView,
  type PapyrusComicDocumentViewProps,
} from "@papyrus-sdk/engine-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";

type ComicEngineAccess = DocumentEngine & {
  getNativeComicEngineId?: () => string | null;
  getNativeComicDocumentGeneration?: () => number;
  getPageCount: () => number;
};

export default function NativeComicDocumentViewer({
  engine,
}: {
  engine: DocumentEngine;
}) {
  const nativeEngine = engine as ComicEngineAccess;
  const engineId = nativeEngine.getNativeComicEngineId?.() ?? undefined;
  const documentGeneration = nativeEngine.getNativeComicDocumentGeneration?.() ?? 0;
  const pageCount = nativeEngine.getPageCount();
  const currentPage = useViewerStore((state) => state.currentPage);
  const zoom = useViewerStore((state) => state.zoom);
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const locale = useViewerStore((state) => state.locale);
  const layoutMode = useViewerStore((state) => state.comicLayoutMode);
  const fitMode = useViewerStore((state) => state.comicFitMode);
  const readingDirection = useViewerStore((state) => state.comicReadingDirection);
  const setDocumentState = useViewerStore((state) => state.setDocumentState);
  const t = getStrings(locale);

  useEffect(() => {
    if (!engineId || pageCount <= 0) return;
    setDocumentState({
      pageCount,
      currentPage: Math.min(pageCount, Math.max(1, currentPage)),
      isLoaded: true,
    });
  }, [currentPage, engineId, pageCount, setDocumentState]);

  const viewProps = useMemo(
    () => ({
      engineId,
      documentGeneration,
      pageCount,
      currentPage,
      layoutMode,
      fitMode,
      readingDirection,
      zoom,
      pageTheme,
      onPageChanged: (event: Parameters<NonNullable<PapyrusComicDocumentViewProps["onPageChanged"]>>[0]) => {
        const page = Math.max(1, Math.min(pageCount, event.nativeEvent.page));
        nativeEngine.goToPage(page);
        setDocumentState({ currentPage: page });
      },
      onZoomChanged: (event: Parameters<NonNullable<PapyrusComicDocumentViewProps["onZoomChanged"]>>[0]) => {
        const nextZoom = Math.max(1, Math.min(5, event.nativeEvent.zoom));
        nativeEngine.setZoom(nextZoom);
        setDocumentState({ zoom: nextZoom });
      },
      onError: (event: Parameters<NonNullable<PapyrusComicDocumentViewProps["onError"]>>[0]) => {
        Alert.alert(t.comicPageError, event.nativeEvent.message || t.comicPageError);
      },
    }) satisfies PapyrusComicDocumentViewProps,
    [
      currentPage,
      documentGeneration,
      engineId,
      fitMode,
      layoutMode,
      nativeEngine,
      pageCount,
      pageTheme,
      readingDirection,
      setDocumentState,
      t.comicPageError,
      zoom,
    ],
  );

  return (
    <View style={styles.container}>
      <PapyrusComicDocumentView {...viewProps} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1 } });
