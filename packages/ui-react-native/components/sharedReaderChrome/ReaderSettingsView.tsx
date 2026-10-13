import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeSheet, NativeSheetScrollView } from "../NativeSheet";
import {
  getReaderSheetPalette,
  type ReaderSheetTheme,
} from "../readerSheetPresentation";
import type { ReaderChoiceOption, ReaderSheetAction } from "./types";

export interface ReaderSettingsViewProps {
  visible: boolean;
  title: string;
  isDark: boolean;
  sheetTheme?: ReaderSheetTheme;
  accentColor: string;
  onClose: () => void;
  onDismiss?: () => void;
  appearanceOptions?: ReaderChoiceOption[];
  appearanceValue?: string;
  appearanceLabel?: string;
  onAppearanceChange?: (value: string) => void;
  transitionOptions?: ReaderChoiceOption[];
  selectedTransition?: string;
  transitionLabel?: string;
  onTransitionChange?: (value: string) => void;
  themeOptions?: ReaderChoiceOption[];
  selectedTheme?: string;
  themeLabel?: string;
  onThemeChange?: (value: string) => void;
  fontSize?: { value: number; min: number; max: number; step: number; onChange: (value: number) => void };
  fontSizeLabel?: string;
  actions?: ReaderSheetAction[];
  children?: React.ReactNode;
}

const ChoiceButtons = ({
  options,
  selected,
  palette,
  accentColor,
  onSelect,
  accessibilityLabelPrefix = "Tema",
}: {
  options: ReaderChoiceOption[];
  selected?: string;
  palette: ReturnType<typeof getReaderSheetPalette>;
  accentColor: string;
  onSelect?: (value: string) => void;
  accessibilityLabelPrefix?: string;
}) => (
  <View style={styles.choiceRow}>
    {options.map((option) => {
      const active = selected === option.value;
      return (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={`${accessibilityLabelPrefix} ${option.label}`}
          accessibilityState={{ selected: active }}
          disabled={!onSelect}
          onPress={() => onSelect?.(option.value)}
          style={[styles.themeOption, { backgroundColor: active ? palette.activeSurface : palette.elevatedSurface, borderColor: active ? accentColor : palette.divider }, active && { borderWidth: 2 }]}
        >
          <View style={[styles.swatch, { backgroundColor: option.swatchColor ?? "#ffffff", borderColor: active ? accentColor : palette.divider }]}>
            {option.swatchForegroundColor ? <View style={[styles.swatchInset, { backgroundColor: option.swatchForegroundColor }]} /> : null}
          </View>
          <Text style={[styles.themeLabel, { color: active ? accentColor : palette.text }]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

export default function ReaderSettingsView({
  visible,
  title,
  isDark,
  sheetTheme,
  accentColor,
  onClose,
  onDismiss,
  appearanceOptions,
  appearanceValue,
  appearanceLabel = "Aparência",
  onAppearanceChange,
  transitionOptions,
  selectedTransition,
  transitionLabel = "Modo de leitura",
  onTransitionChange,
  themeOptions,
  selectedTheme,
  themeLabel = "Tema da página",
  onThemeChange,
  fontSize,
  fontSizeLabel = "Tamanho da fonte",
  actions = [],
  children,
}: ReaderSettingsViewProps) {
  const palette = getReaderSheetPalette(sheetTheme ?? isDark);
  const adjustFontSize = (delta: -1 | 1) => {
    if (!fontSize) return;
    const next = Math.max(fontSize.min, Math.min(fontSize.max, fontSize.value + fontSize.step * delta));
    fontSize.onChange(Number(next.toFixed(2)));
  };

  return (
    <NativeSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      isDark={isDark}
      sheetTheme={sheetTheme}
      sheetPalette={palette}
      maxHeight="82%"
      title={title}
      showHeader
      closeAccessibilityLabel="Fechar configurações de leitura"
    >
      <NativeSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {appearanceOptions?.length && onAppearanceChange ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>{appearanceLabel}</Text>
            <ChoiceButtons options={appearanceOptions} selected={appearanceValue} palette={palette} accentColor={accentColor} onSelect={onAppearanceChange} accessibilityLabelPrefix="Aparência" />
          </View>
        ) : null}
        {themeOptions?.length && onThemeChange ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>{themeLabel}</Text>
            <ChoiceButtons options={themeOptions} selected={selectedTheme} palette={palette} accentColor={accentColor} onSelect={onThemeChange} />
          </View>
        ) : null}
        {fontSize ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>{fontSizeLabel}</Text>
            <View style={styles.fontControls}>
              <Pressable accessibilityRole="button" accessibilityLabel="Diminuir tamanho do texto" disabled={fontSize.value <= fontSize.min} onPress={() => adjustFontSize(-1)} style={[styles.fontButton, { backgroundColor: palette.elevatedSurface, borderColor: palette.divider }]}>
                <Text style={[styles.fontButtonText, { color: palette.text }]}>A−</Text>
              </Pressable>
              <Text accessibilityLabel={`Tamanho do texto ${Math.round(fontSize.value * 100)} por cento`} style={[styles.fontValue, { color: palette.text }]}>{Math.round(fontSize.value * 100)}%</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Aumentar tamanho do texto" disabled={fontSize.value >= fontSize.max} onPress={() => adjustFontSize(1)} style={[styles.fontButton, { backgroundColor: palette.elevatedSurface, borderColor: palette.divider }]}>
                <Text style={[styles.fontButtonText, { color: palette.text }]}>A+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {transitionOptions?.length && onTransitionChange ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>{transitionLabel}</Text>
            <View style={styles.choiceRow}>
              {transitionOptions.map((option) => {
                const active = selectedTransition === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityLabel={`Modo ${option.label}`}
                    accessibilityState={{ selected: active }}
                    onPress={() => onTransitionChange(option.value)}
                    style={[styles.modeButton, { backgroundColor: active ? accentColor : palette.elevatedSurface, borderColor: active ? accentColor : palette.divider }]}
                  >
                    <Text style={[styles.themeLabel, { color: active ? "#ffffff" : palette.text }]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {actions.map((action) => (
          <Pressable key={action.key} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={[styles.actionRow, { borderBottomColor: palette.divider }]}>
            {action.icon}
            <Text style={[styles.actionLabel, { color: palette.text }]}>{action.label}</Text>
            <Text style={[styles.actionChevron, { color: palette.text }]}>›</Text>
          </Pressable>
        ))}
        {children}
      </NativeSheetScrollView>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 24 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontWeight: "800", color: "#111827", marginBottom: 8 },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeOption: { minWidth: 76, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1.5 },
  swatch: { width: 34, height: 34, borderRadius: 17, marginBottom: 8, overflow: "hidden", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  swatchInset: { position: "absolute", left: 0, top: 0, bottom: 0, width: "50%" },
  themeLabel: { fontSize: 11, lineHeight: 15, fontWeight: "700", textAlign: "center" },
  fontControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  fontButton: { minWidth: 48, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  fontButtonText: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: "#111827" },
  modeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  fontValue: { minWidth: 52, textAlign: "center", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  actionRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: "700" },
  actionChevron: { fontSize: 24, lineHeight: 28 },
});
