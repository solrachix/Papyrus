import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";

type OverflowSheetProps = {
  visible: boolean;
  onClose: () => void;
  onOpenActions: () => void;
};

const actionLabels = [{ key: "actions", label: "Document actions" }] as const;

export function OverflowSheet({
  visible,
  onClose,
  onOpenActions,
}: OverflowSheetProps) {
  const { uiTheme, accentColor } = useViewerStore();
  const isDark = uiTheme === "dark";

  const handlers = {
    actions: onOpenActions,
  } as const;

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
          <View style={styles.handle} />
          {actionLabels.map((action) => (
            <Pressable
              key={action.key}
              onPress={handlers[action.key]}
              style={[styles.actionButton, { borderColor: accentColor }]}
              accessibilityLabel={action.label}
            >
              <Text
                style={[styles.actionText, isDark && styles.actionTextDark]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
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
    padding: 16,
    gap: 10,
  },
  cardDark: {
    backgroundColor: "#0f1115",
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#94a3b8",
    marginBottom: 4,
  },
  actionButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  actionTextDark: {
    color: "#f8fafc",
  },
});
