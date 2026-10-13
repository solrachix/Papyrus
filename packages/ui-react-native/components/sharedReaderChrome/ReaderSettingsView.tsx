import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { NativeSheet, NativeSheetScrollView } from "../NativeSheet";
import type { ReaderChoiceOption, ReaderSheetAction } from "./types";

export interface ReaderSettingsViewProps {
  visible: boolean;
  title: string;
  isDark: boolean;
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
  isDark,
  accentColor,
  onSelect,
  accessibilityLabelPrefix = "Tema",
}: {
  options: ReaderChoiceOption[];
  selected?: string;
  isDark: boolean;
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
          style={[styles.themeOption, isDark && styles.themeOptionDark, active && { borderColor: accentColor, borderWidth: 2 }]}
        >
          <View style={[styles.swatch, { backgroundColor: option.swatchColor ?? "#ffffff", borderColor: active ? accentColor : isDark ? "#374151" : "#d1d5db" }]}>
            {option.swatchForegroundColor ? <View style={[styles.swatchInset, { backgroundColor: option.swatchForegroundColor }]} /> : null}
          </View>
          <Text style={[styles.themeLabel, isDark && styles.textDark, active && { color: accentColor }]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

export default function ReaderSettingsView({
  visible,
  title,
  isDark,
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
      maxHeight="82%"
      title={title}
      showHeader
      closeAccessibilityLabel="Fechar configurações de leitura"
    >
      <NativeSheetScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {appearanceOptions?.length && onAppearanceChange ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{appearanceLabel}</Text>
            <ChoiceButtons options={appearanceOptions} selected={appearanceValue} isDark={isDark} accentColor={accentColor} onSelect={onAppearanceChange} accessibilityLabelPrefix="Aparência" />
          </View>
        ) : null}
        {themeOptions?.length && onThemeChange ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{themeLabel}</Text>
            <ChoiceButtons options={themeOptions} selected={selectedTheme} isDark={isDark} accentColor={accentColor} onSelect={onThemeChange} />
          </View>
        ) : null}
        {fontSize ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{fontSizeLabel}</Text>
            <View style={styles.fontControls}>
              <Pressable accessibilityRole="button" accessibilityLabel="Diminuir tamanho do texto" disabled={fontSize.value <= fontSize.min} onPress={() => adjustFontSize(-1)} style={[styles.fontButton, isDark && styles.fontButtonDark]}>
                <Text style={[styles.fontButtonText, isDark && styles.textDark]}>A−</Text>
              </Pressable>
              <Text accessibilityLabel={`Tamanho do texto ${Math.round(fontSize.value * 100)} por cento`} style={[styles.fontValue, isDark && styles.textDark]}>{Math.round(fontSize.value * 100)}%</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Aumentar tamanho do texto" disabled={fontSize.value >= fontSize.max} onPress={() => adjustFontSize(1)} style={[styles.fontButton, isDark && styles.fontButtonDark]}>
                <Text style={[styles.fontButtonText, isDark && styles.textDark]}>A+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {transitionOptions?.length && onTransitionChange ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>{transitionLabel}</Text>
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
                    style={[styles.modeButton, isDark && styles.modeButtonDark, active && { backgroundColor: accentColor }]}
                  >
                    <Text style={[styles.themeLabel, isDark && styles.textDark, active && styles.modeTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {actions.map((action) => (
          <Pressable key={action.key} accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={[styles.actionRow, isDark && styles.actionRowDark]}>
            {action.icon}
            <Text style={[styles.actionLabel, isDark && styles.textDark]}>{action.label}</Text>
            <Text style={[styles.actionChevron, isDark && styles.textDark]}>›</Text>
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
  textDark: { color: "#e5e7eb" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  themeOption: { minWidth: 76, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1.5, borderColor: "#d1d5db", backgroundColor: "#f9fafb" },
  themeOptionDark: { borderColor: "#374151", backgroundColor: "#111827" },
  swatch: { width: 34, height: 34, borderRadius: 17, marginBottom: 8, overflow: "hidden", borderWidth: 1, alignItems: "center", justifyContent: "center" },
  swatchInset: { position: "absolute", left: 0, top: 0, bottom: 0, width: "50%" },
  themeLabel: { fontSize: 11, lineHeight: 15, fontWeight: "700", color: "#111827", textAlign: "center" },
  fontControls: { flexDirection: "row", alignItems: "center", gap: 12 },
  fontButton: { minWidth: 48, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#d1d5db", alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb" },
  fontButtonDark: { backgroundColor: "#111827", borderColor: "#374151" },
  fontButtonText: { fontSize: 18, lineHeight: 24, fontWeight: "700", color: "#111827" },
  modeButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#e5e7eb" },
  modeButtonDark: { backgroundColor: "#111827", borderColor: "#374151" },
  modeTextActive: { color: "#ffffff" },
  fontValue: { minWidth: 52, textAlign: "center", fontSize: 12, lineHeight: 18, fontWeight: "700", color: "#111827" },
  actionRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e7eb" },
  actionRowDark: { borderBottomColor: "#374151" },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827" },
  actionChevron: { fontSize: 24, lineHeight: 28, color: "#111827" },
});
