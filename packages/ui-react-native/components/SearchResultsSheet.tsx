import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import { NativeSheet, NativeSheetScrollView } from "./NativeSheet";
import { getReaderSheetPalette } from "./readerSheetPresentation";

type SearchResultsSheetProps = {
  documentType: DocumentType;
  visible: boolean;
  onClose: () => void;
};

export function SearchResultsSheet({
  documentType,
  visible,
  onClose,
}: SearchResultsSheetProps) {
  const {
    activeSearchIndex,
    locale,
    pageCount,
    searchResults,
    setDocumentState,
    triggerScrollToPage,
    uiTheme,
    accentColor,
  } = useViewerStore();
  const isDark = uiTheme === "dark";
  const palette = getReaderSheetPalette(isDark);
  const t = getStrings(locale);
  const getResultLabel = (pageIndex: number) => {
    if (documentType === "pdf") return `${t.page} ${pageIndex + 1}`;
    if (documentType === "epub") return `${t.contents} ${pageIndex + 1}`;
    const percent =
      pageCount <= 1 ? 100 : Math.round(((pageIndex + 1) / pageCount) * 100);
    return `${t.progress} ${percent}%`;
  };

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      isDark={isDark}
      maxHeight="72%"
      showHeader
      title={t.allResults}
      closeAccessibilityLabel="Close search results"
      sheetStyle={{
        paddingBottom: 18,
        backgroundColor: palette.surface,
        borderTopColor: palette.divider,
      }}
    >
      <Text style={[styles.meta, { color: palette.mutedText }]}>
        {searchResults.length} {t.results}
      </Text>
      <NativeSheetScrollView contentContainerStyle={styles.content}>
        {searchResults.length === 0 ? (
          <Text style={[styles.emptyText, { color: palette.mutedText }]}>
            {t.noResults}
          </Text>
        ) : (
          searchResults.map((result, index) => {
            const isActive = index === activeSearchIndex;
            return (
              <Pressable
                key={`${result.pageIndex}-${index}`}
                onPress={() => {
                  setDocumentState({
                    activeSearchIndex: index,
                    currentPage: result.pageIndex + 1,
                  });
                  triggerScrollToPage(result.pageIndex);
                  onClose();
                }}
                style={[
                  styles.resultCard,
                  {
                    borderColor: isActive ? accentColor : palette.divider,
                    backgroundColor: isActive
                      ? `${accentColor}14`
                      : palette.elevatedSurface,
                  },
                ]}
              >
                <Text style={[styles.resultLabel, { color: accentColor }]}>
                  {getResultLabel(result.pageIndex)}
                </Text>
                <Text style={[styles.resultText, { color: palette.text }]}>
                  {result.text}
                </Text>
              </Pressable>
            );
          })
        )}
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 12, paddingHorizontal: 18, marginBottom: 10 },
  content: { paddingHorizontal: 18, paddingBottom: 18, gap: 10 },
  emptyText: { fontSize: 13 },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    marginBottom: 10,
  },
  resultLabel: { fontSize: 11, fontWeight: "800" },
  resultText: { fontSize: 12 },
});
