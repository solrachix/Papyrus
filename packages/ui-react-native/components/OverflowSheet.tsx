import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { NativeSheet } from "./NativeSheet";
import { getReaderSheetPalette } from "./readerSheetPresentation";

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
  const isDark = useViewerStore((state) => state.uiTheme === "dark");
  const palette = getReaderSheetPalette(isDark);

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      isDark={isDark}
      maxHeight="45%"
      showHeader
      title="More"
      closeAccessibilityLabel="Close more actions"
      sheetStyle={{
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: palette.surface,
        borderTopColor: palette.divider,
      }}
    >
      <View style={styles.actionList}>
        {actionLabels.map((action) => (
          <Pressable
            key={action.key}
            onPress={onOpenActions}
            style={[
              styles.actionButton,
              {
                borderColor: palette.divider,
                backgroundColor: palette.elevatedSurface,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text style={[styles.actionText, { color: palette.text }]}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  actionList: { gap: 10 },
  actionButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionText: { fontSize: 14, fontWeight: "700" },
});
