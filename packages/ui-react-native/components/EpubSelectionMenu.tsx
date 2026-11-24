import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Locale } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import { IconBookOpen, IconComment, IconCopy, IconStrikeout, IconUnderline } from "../icons";
import { ANNOTATION_COLORS } from "./annotationColors";
import type { EpubSelectionRect } from "./epubAnnotationEvents";
import { getSelectionMenuPosition } from "./epubSelectionMenuLayout";
import type { ReaderSheetPalette } from "./readerSheetPresentation";

export type EpubSelectionMenuAction = "copy" | "underline" | "strikeout" | "note" | "consult";

const ACTION_WIDTH = 60;
const PADDING = 8;
const COLOR_ROW_HEIGHT = 40;
const ACTION_ROW_HEIGHT = 52;
export const EPUB_SELECTION_MENU_HEIGHT = PADDING * 2 + COLOR_ROW_HEIGHT + ACTION_ROW_HEIGHT + 1;

export const getEpubSelectionMenuActions = (canConsult: boolean): EpubSelectionMenuAction[] =>
  ["copy", "underline", "strikeout", "note", ...(canConsult ? ["consult" as const] : [])];

export const getEpubSelectionMenuWidth = (actionCount: number) => PADDING * 2 + actionCount * ACTION_WIDTH;

type Props = {
  /** Selection rect in the menu container's coordinates. */
  anchor: EpubSelectionRect;
  container: { width: number; height: number };
  topInset?: number;
  bottomInset?: number;
  locale: Locale | undefined;
  palette: ReaderSheetPalette;
  canConsult: boolean;
  onHighlight: (color: string) => void;
  onAction: (action: EpubSelectionMenuAction) => void;
};

/**
 * Papyrus-drawn selection menu for EPUB on Android. The native WebView action
 * mode only fits three or four text items and overflows off-screen near the
 * right edge; this menu is clamped inside the reader and anchored to the
 * selection rectangle reported by the runtime.
 */
export function EpubSelectionMenu({ anchor, container, topInset, bottomInset, locale, palette, canConsult, onHighlight, onAction }: Props) {
  const t = getStrings(locale);
  const actions = getEpubSelectionMenuActions(canConsult);
  const width = Math.min(getEpubSelectionMenuWidth(actions.length), Math.max(0, container.width - 16));
  const position = getSelectionMenuPosition({ anchor, menu: { width, height: EPUB_SELECTION_MENU_HEIGHT }, container, topInset, bottomInset });
  if (!position) return null;
  const colorNames = [t.colorYellow, t.colorPink, t.colorBlue, t.colorGreen, t.colorPurple];
  const iconColor = palette.text;
  const labels: Record<EpubSelectionMenuAction, string> = {
    copy: t.copy,
    underline: t.annotationUnderline,
    strikeout: t.annotationStrikeout,
    note: t.annotationNote,
    consult: t.consult,
  };
  const icon = (action: EpubSelectionMenuAction) => {
    switch (action) {
      case "copy": return <IconCopy size={20} color={iconColor} />;
      case "underline": return <IconUnderline size={20} color={iconColor} />;
      case "strikeout": return <IconStrikeout size={20} color={iconColor} />;
      case "note": return <IconComment size={20} color={iconColor} />;
      case "consult": return <IconBookOpen size={20} color={iconColor} />;
    }
  };
  return (
    <View
      accessibilityRole="menu"
      accessibilityLabel={t.selectionActions}
      testID="papyrus-epub-selection-menu"
      style={[styles.menu, { left: position.left, top: position.top, width, backgroundColor: palette.surface, borderColor: palette.divider }]}
    >
      <View style={styles.colors}>
        {ANNOTATION_COLORS.map((color, index) => (
          <Pressable
            key={color}
            accessibilityRole="button"
            accessibilityLabel={`${t.annotationHighlight}: ${colorNames[index]}`}
            hitSlop={4}
            onPress={() => onHighlight(color)}
            style={({ pressed }) => [styles.dot, { backgroundColor: color, opacity: pressed ? 0.7 : 1 }]}
          />
        ))}
      </View>
      <View style={[styles.divider, { backgroundColor: palette.divider }]} />
      <View style={styles.actions}>
        {actions.map(action => (
          <Pressable
            key={action}
            accessibilityRole="button"
            accessibilityLabel={labels[action]}
            onPress={() => onAction(action)}
            style={({ pressed }) => [styles.action, pressed && { backgroundColor: palette.activeSurface }]}
          >
            {icon(action)}
            <Text numberOfLines={1} style={[styles.label, { color: palette.mutedText }]}>{labels[action]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    padding: PADDING,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 50,
  },
  colors: {
    height: COLOR_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  dot: { width: 26, height: 26, borderRadius: 13 },
  divider: { height: 1 },
  actions: { height: ACTION_ROW_HEIGHT, flexDirection: "row", alignItems: "center" },
  action: {
    flex: 1,
    height: ACTION_ROW_HEIGHT - 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    gap: 2,
  },
  label: { fontSize: 11, fontWeight: "600" },
});
