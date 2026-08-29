import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { resolvePageJumpTarget } from "./pageJumpModel";

type PageJumpModalProps = {
  visible: boolean;
  currentPage: number;
  pageCount: number;
  isDark: boolean;
  accentColor: string;
  onClose: () => void;
  onConfirm: (page: number) => void;
};

export function PageJumpModal({
  visible,
  currentPage,
  pageCount,
  isDark,
  accentColor,
  onClose,
  onConfirm,
}: PageJumpModalProps) {
  const [value, setValue] = useState(`${currentPage}`);

  useEffect(() => {
    if (visible) setValue(`${currentPage}`);
  }, [currentPage, visible]);

  const confirmJump = () => {
    const targetPage = resolvePageJumpTarget(value, pageCount);
    if (targetPage) onConfirm(targetPage);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, isDark && styles.cardDark]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.title, isDark && styles.titleDark]}>
            Ir para pagina
          </Text>
          <TextInput
            value={value}
            onChangeText={(text) => setValue(text.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            autoFocus
            selectTextOnFocus
            maxLength={6}
            placeholder="1"
            placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
            style={[styles.input, isDark && styles.inputDark]}
          onSubmitEditing={confirmJump}
          accessibilityLabel="Page jump input"
          testID="papyrus-page-jump-input"
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[
                styles.actionButton,
                styles.actionCancel,
                isDark && styles.actionCancelDark,
              ]}
            >
              <Text style={[styles.actionText, isDark && styles.actionTextDark]}>
                Cancelar
              </Text>
            </Pressable>
            <Pressable
              onPress={confirmJump}
              style={[styles.actionButton, { backgroundColor: accentColor }]}
              testID="papyrus-page-jump-confirm"
            >
              <Text style={[styles.actionText, styles.actionTextPrimary]}>
                Ir
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
  },
  cardDark: {
    backgroundColor: "#0f1115",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  titleDark: {
    color: "#f8fafc",
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  inputDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
    color: "#f8fafc",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionCancel: {
    backgroundColor: "#e5e7eb",
  },
  actionCancelDark: {
    backgroundColor: "#111827",
  },
  actionText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  actionTextDark: {
    color: "#e5e7eb",
  },
  actionTextPrimary: {
    color: "#ffffff",
  },
});
