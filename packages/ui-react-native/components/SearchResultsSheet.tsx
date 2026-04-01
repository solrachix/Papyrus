import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";

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
  const t = getStrings(locale);

  const getResultLabel = (pageIndex: number) => {
    if (documentType === "pdf") return `${t.page} ${pageIndex + 1}`;
    if (documentType === "epub") return `${t.contents} ${pageIndex + 1}`;
    const percent =
      pageCount <= 1 ? 100 : Math.round(((pageIndex + 1) / pageCount) * 100);
    return `${t.progress} ${percent}%`;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, isDark && styles.sheetDark]}>
          <View style={[styles.handle, isDark && styles.handleDark]} />
          <View style={styles.header}>
            <Text style={[styles.title, isDark && styles.titleDark]}>
              {t.allResults}
            </Text>
            <Text style={[styles.meta, isDark && styles.metaDark]}>
              {searchResults.length} {t.results}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            {searchResults.length === 0 ? (
              <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
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
                      isDark && styles.resultCardDark,
                      isActive && {
                        borderColor: accentColor,
                        backgroundColor: `${accentColor}14`,
                      },
                    ]}
                  >
                    <Text style={[styles.resultLabel, { color: accentColor }]}>
                      {getResultLabel(result.pageIndex)}
                    </Text>
                    <Text
                      style={[
                        styles.resultText,
                        isDark && styles.resultTextDark,
                      ]}
                    >
                      {result.text}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: "transparent",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "72%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingBottom: 18,
  },
  sheetDark: {
    backgroundColor: "#0f1115",
    borderTopColor: "#1f2937",
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#cbd5f5",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 12,
  },
  handleDark: {
    backgroundColor: "#374151",
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 10,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  titleDark: {
    color: "#f8fafc",
  },
  meta: {
    fontSize: 12,
    color: "#64748b",
  },
  metaDark: {
    color: "#94a3b8",
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: "#64748b",
  },
  emptyTextDark: {
    color: "#94a3b8",
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
    marginBottom: 10,
  },
  resultCardDark: {
    backgroundColor: "#111827",
    borderColor: "#1f2937",
  },
  resultLabel: {
    fontSize: 11,
    fontWeight: "800",
  },
  resultText: {
    fontSize: 12,
    color: "#334155",
  },
  resultTextDark: {
    color: "#cbd5e1",
  },
});
