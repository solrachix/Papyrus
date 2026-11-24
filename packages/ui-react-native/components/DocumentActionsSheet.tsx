import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { getStrings } from "../mobileStrings";
import { NativeSheet } from "./NativeSheet";
import { useReaderSheetAppearance } from "./useReaderSheetAppearance";

type DocumentActionsSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function DocumentActionsSheet({
  visible,
  onClose,
}: DocumentActionsSheetProps) {
  const { locale } = useViewerStore();
  const t = getStrings(locale);
  const { isDark, sheetTheme, palette } = useReaderSheetAppearance();

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      isDark={isDark}
      sheetTheme={sheetTheme}
      sheetPalette={palette}
      maxHeight="55%"
      showHeader
      title={t.documentActions}
      closeAccessibilityLabel={t.closeDocumentActions}
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
          <Text style={[styles.actionText, { color: palette.text }]}>{t.share}</Text>
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
          <Text style={[styles.actionText, { color: palette.text }]}>{t.export}</Text>
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
