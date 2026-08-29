import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { NativeSheet, NativeSheetScrollView } from "./NativeSheet";
import { buildInfoRows } from "./infoSheetModel";
import { getReaderSheetPalette } from "./readerSheetPresentation";

type InfoSheetProps = {
  visible: boolean;
  title?: string;
  documentType: DocumentType;
  onClose: () => void;
};

export function InfoSheet({
  visible,
  title,
  documentType,
  onClose,
}: InfoSheetProps) {
  const {
    uiTheme,
    currentPage,
    pageCount,
    zoom,
    rotation,
    viewMode,
    pageTheme,
    locale,
  } = useViewerStore();
  const isDark = uiTheme === "dark";
  const palette = getReaderSheetPalette(isDark);
  const isPortuguese = locale === "pt-BR";
  const rows = buildInfoRows({
    title,
    documentType,
    currentPage,
    pageCount,
    zoom,
    rotation,
    viewMode,
    uiTheme,
    pageTheme,
    locale,
  });

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      isDark={isDark}
      maxHeight="88%"
      showHeader
      title={isPortuguese ? "Informações" : "Information"}
      closeAccessibilityLabel={
        isPortuguese ? "Fechar informações" : "Close information"
      }
      sheetStyle={{
        minHeight: 560,
        backgroundColor: palette.surface,
        borderTopColor: palette.divider,
      }}
    >
      <View style={styles.sheet}>
        <NativeSheetScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sectionTitle, { color: palette.mutedText }]}>
            {isPortuguese ? "Resumo do documento" : "Document summary"}
          </Text>
          <View style={[styles.rows, { borderTopColor: palette.divider }]}>
            {rows.map((row) => (
              <View
                key={row.label}
                style={[styles.row, { borderBottomColor: palette.divider }]}
              >
                <Text style={[styles.label, { color: palette.mutedText }]}>
                  {row.label}
                </Text>
                <Text
                  style={[styles.value, { color: palette.text }]}
                  selectable
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        </NativeSheetScrollView>
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    paddingBottom: 16,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  rows: {
    borderTopWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
  },
  label: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  value: {
    flex: 1.2,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right",
    fontWeight: "600",
  },
});
