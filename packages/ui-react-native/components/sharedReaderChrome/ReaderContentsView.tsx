import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { NativeSheet, NativeSheetScrollView } from "../NativeSheet";
import type { ReaderContentsEntry } from "./types";

export interface ReaderContentsViewProps<T = unknown> {
  visible: boolean;
  title: string;
  isDark: boolean;
  accentColor: string;
  entries: ReaderContentsEntry<T>[];
  onSelect?: (entry: ReaderContentsEntry<T>) => void;
  onClose: () => void;
  emptyMessage?: string;
  closeAccessibilityLabel?: string;
}

export default function ReaderContentsView<T = unknown>({
  visible,
  title,
  isDark,
  accentColor,
  entries,
  onSelect,
  onClose,
  emptyMessage = "Nenhum capítulo disponível",
  closeAccessibilityLabel = "Fechar sumário",
}: ReaderContentsViewProps<T>) {
  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      isDark={isDark}
      title={title}
      showHeader
      closeAccessibilityLabel={closeAccessibilityLabel}
    >
      <NativeSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <Text style={[styles.empty, isDark && styles.emptyDark]}>{emptyMessage}</Text>
        ) : entries.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${entry.title}`}
            disabled={entry.disabled || !onSelect}
            onPress={() => onSelect?.(entry)}
            style={[styles.entry, { paddingLeft: 12 + Math.min(Math.max(entry.depth ?? 0, 0), 6) * 14 }, entry.disabled && styles.disabled]}
          >
            <Text numberOfLines={2} style={[styles.entryTitle, isDark && styles.entryTitleDark]}>{entry.title}</Text>
            <Text style={[styles.chevron, { color: accentColor }]}>›</Text>
          </Pressable>
        ))}
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 12, paddingBottom: 20 },
  entry: { minHeight: 52, paddingRight: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  entryTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", color: "#111827" },
  entryTitleDark: { color: "#e5e7eb" },
  chevron: { fontSize: 22, lineHeight: 26, fontWeight: "500" },
  empty: { paddingHorizontal: 12, paddingVertical: 24, fontSize: 14, lineHeight: 20, color: "#6b7280", textAlign: "center" },
  emptyDark: { color: "#9ca3af" },
  disabled: { opacity: 0.5 },
});
