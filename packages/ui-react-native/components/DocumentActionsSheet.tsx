import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";

type DocumentActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function DocumentActionsSheet({
  visible,
  onClose,
}: DocumentActionsSheetProps) {
  const { uiTheme } = useViewerStore();
  const isDark = uiTheme === "dark";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.card, isDark && styles.cardDark]}
        >
          <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>
            Document actions
          </Text>
          <View style={styles.actionList}>
            <View style={[styles.actionItem, isDark && styles.actionItemDark]}>
              <Text style={[styles.actionText, isDark && styles.actionTextDark]}>
                Share
              </Text>
            </View>
            <View style={[styles.actionItem, isDark && styles.actionItemDark]}>
              <Text style={[styles.actionText, isDark && styles.actionTextDark]}>
                Export
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close actions sheet">
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
    padding: 16,
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 10,
  },
  cardDark: {
    backgroundColor: "#0f1115",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#64748b",
  },
  eyebrowDark: {
    color: "#94a3b8",
  },
  actionList: {
    gap: 10,
  },
  actionItem: {
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionItemDark: {
    backgroundColor: "#111827",
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  actionTextDark: {
    color: "#f8fafc",
  },
  closeButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  closeText: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
