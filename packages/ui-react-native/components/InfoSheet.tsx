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
import { buildInfoRows } from "./infoSheetModel";
import { IconClose } from "../icons";

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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.card, isDark && styles.cardDark]}
        >
          <View style={styles.topRow}>
            <Pressable
              onPress={onClose}
              style={[
                styles.iconCloseButton,
                isDark && styles.iconCloseButtonDark,
              ]}
              accessibilityLabel="Close info sheet"
            >
              <IconClose size={18} color={isDark ? "#f8fafc" : "#111827"} />
            </Pressable>
            <Text
              style={[styles.headerTitle, isDark && styles.headerTitleDark]}
              numberOfLines={1}
            >
              {locale === "pt-BR" ? "Informações" : "Information"}
            </Text>
            <View style={styles.topRowSpacer} />
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}
          >
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {locale === "pt-BR" ? "Informações" : "Information"}
            </Text>
            <View style={styles.rows}>
              {rows.map((row) => (
                <View
                  key={row.label}
                  style={[styles.row, isDark && styles.rowDark]}
                >
                  <Text style={[styles.label, isDark && styles.labelDark]}>
                    {row.label}
                  </Text>
                  <Text
                    style={[styles.value, isDark && styles.valueDark]}
                    selectable
                  >
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
    padding: 16,
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 22,
    minHeight: 560,
    maxHeight: "88%",
  },
  cardDark: {
    backgroundColor: "#0f1115",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 18,
  },
  topRowSpacer: {
    width: 42,
  },
  iconCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  iconCloseButtonDark: {
    backgroundColor: "#111827",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  headerTitleDark: {
    color: "#f8fafc",
  },
  content: {
    flexGrow: 0,
  },
  contentInner: {
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#475569",
    marginBottom: 14,
  },
  sectionTitleDark: {
    color: "#c7c9cf",
  },
  rows: {
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.24)",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(148,163,184,0.24)",
  },
  rowDark: {
    borderBottomColor: "rgba(148,163,184,0.2)",
  },
  label: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#6b7280",
  },
  labelDark: {
    color: "#b1b5be",
  },
  value: {
    flex: 1.2,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "right",
    color: "#111827",
    fontWeight: "500",
  },
  valueDark: {
    color: "#f3f4f6",
  },
});
