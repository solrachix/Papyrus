import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { NativeSheet } from "./NativeSheet";
import { getReaderSheetPalette } from "./readerSheetPresentation";

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
  const palette = getReaderSheetPalette(isDark);

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      isDark={isDark}
      maxHeight="55%"
      showHeader
      title="Document actions"
      closeAccessibilityLabel="Close document actions"
      sheetStyle={{
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: palette.surface,
        borderTopColor: palette.divider,
      }}
    >
      <View style={styles.actionList}>
        <View
          style={[
            styles.actionItem,
            {
              backgroundColor: palette.elevatedSurface,
              borderColor: palette.divider,
            },
          ]}
        >
          <Text style={[styles.actionText, { color: palette.text }]}>Share</Text>
        </View>
        <View
          style={[
            styles.actionItem,
            {
              backgroundColor: palette.elevatedSurface,
              borderColor: palette.divider,
            },
          ]}
        >
          <Text style={[styles.actionText, { color: palette.text }]}>Export</Text>
        </View>
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  actionList: {
    gap: 10,
  },
  actionItem: {
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "700",
  },
});
