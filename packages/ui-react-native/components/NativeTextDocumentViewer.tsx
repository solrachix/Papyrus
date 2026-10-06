import React, { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  PapyrusTextDocumentView,
  type PapyrusTextDocumentViewProps,
} from "@papyrus-sdk/engine-native";
import { papyrusEvents, useViewerStore } from "@papyrus-sdk/core";
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
  onTextRangeSelected?: (selection: TextRangeSelection) => void;
  onDefineSelection?: (selection: TextRangeSelection) => void;
  defineSelectionMode?: "selection" | "single-word";
};

export default function NativeTextDocumentViewer({
  engine,
  onTextRangeSelected,
  onDefineSelection,
  defineSelectionMode = "selection",
}: Props) {
  const nativeEngine = engine as TextEngineAccess;
  const engineId = nativeEngine.getNativeTextEngineId?.() ?? undefined;
  const documentGeneration = nativeEngine.getNativeTextDocumentGeneration?.() ?? 0;
  const measuredTextLength = nativeEngine.getTextLength?.() ?? 0;
  const locale = useViewerStore((state) => state.locale);
  const insets = usePapyrusSafeAreaInsets();
  const pageTheme = useViewerStore((state) => state.pageTheme);
  const uiTheme = useViewerStore((state) => state.uiTheme);
  const textLength = useViewerStore((state) => state.textLength);
  const currentTextOffset = useViewerStore((state) => state.currentTextOffset);
  const scrollToTextOffsetSignal = useViewerStore(
    (state) => state.scrollToTextOffsetSignal,
  );
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
      documentGeneration,
      textLength: textLength || measuredTextLength,
      currentTextOffset,
      scrollToTextOffsetSignal,
      searchResults: textSearchResults,
      activeSearchIndex,
      pageTheme,
      uiTheme,
      fontSize: 18,
      lineHeight: 28,
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
      uiTheme,
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
