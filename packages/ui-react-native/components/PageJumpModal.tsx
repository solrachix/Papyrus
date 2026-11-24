import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { getStrings } from "../mobileStrings";
import { resolvePageJumpTarget } from "./pageJumpModel";
import { NativeSheet } from "./NativeSheet";
import { useReaderSheetAppearance } from "./useReaderSheetAppearance";

type PageJumpModalProps = {
  documentType?: string;
  visible: boolean;
  currentPage: number;
  pageCount: number;
  /** @deprecated The sheet follows the viewer page theme. */
  isDark?: boolean;
  accentColor: string;
  onClose: () => void;
  onConfirm: (page: number) => void;
};

export function PageJumpModal({
  documentType,
  visible,
  currentPage,
  pageCount,
  accentColor,
  onClose,
  onConfirm,
}: PageJumpModalProps) {
  const t = getStrings(useViewerStore((state) => state.locale));
  const [value, setValue] = useState(`${currentPage}`);
  const { isDark, sheetTheme, palette } = useReaderSheetAppearance();
  useEffect(() => {
    if (visible) setValue(`${currentPage}`);
  }, [currentPage, visible]);
  const confirmJump = () => {
    const targetPage = resolvePageJumpTarget(value, pageCount);
    if (targetPage) onConfirm(targetPage);
    onClose();
  };

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      isDark={isDark}
      sheetTheme={sheetTheme}
      sheetPalette={palette}
      maxHeight={300}
      showHeader
      title={documentType === "epub" ? t.goToChapter : t.goToPage}
      closeAccessibilityLabel={t.closeNavigation}
      sheetStyle={{
        paddingHorizontal: 18,
        paddingBottom: 18,
        backgroundColor: palette.surface,
        borderTopColor: palette.divider,
      }}
    >
      <TextInput
        value={value}
        onChangeText={(text) => setValue(text.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        autoFocus
        selectTextOnFocus
        maxLength={6}
        placeholder="1"
        placeholderTextColor={palette.mutedText}
        style={[
          styles.input,
          {
            color: palette.text,
            backgroundColor: palette.elevatedSurface,
            borderColor: palette.divider,
          },
        ]}
        onSubmitEditing={confirmJump}
        accessibilityLabel={documentType === "epub" ? t.chapterNumber : t.pageNumber}
        testID="papyrus-page-jump-input"
      />
      <View style={styles.actions}>
        <Pressable
          onPress={onClose}
          style={[
            styles.actionButton,
            { backgroundColor: palette.closeSurface },
          ]}
        >
          <Text style={[styles.actionText, { color: palette.text }]}>
            {t.cancel}
          </Text>
        </Pressable>
        <Pressable
          onPress={confirmJump}
          style={[styles.actionButton, { backgroundColor: accentColor }]}
          testID="papyrus-page-jump-confirm"
        >
          <Text style={[styles.actionText, styles.actionTextPrimary]}>{t.go}</Text>
        </Pressable>
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  actionButton: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9 },
  actionText: { fontSize: 12, fontWeight: "800" },
  actionTextPrimary: { color: "#ffffff" },
});
