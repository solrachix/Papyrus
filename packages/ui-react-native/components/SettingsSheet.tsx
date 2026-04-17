import React, { useCallback, useMemo } from "react";
import { Dimensions, View, Text, Pressable, StyleSheet } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentEngine, PageTheme } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import { IconZoomIn, IconZoomOut } from "../icons";

interface SettingsSheetProps {
  engine: DocumentEngine;
  visible: boolean;
  onClose: () => void;
}

const PAGE_THEME_OPTIONS: Array<{ value: PageTheme; labelKey: ThemeLabelKey }> = [
  { value: "normal", labelKey: "themeOriginal" },
  { value: "sepia", labelKey: "themeSepia" },
  { value: "dark", labelKey: "themeDark" },
  { value: "high-contrast", labelKey: "themeContrast" },
];

type ThemeLabelKey =
  | "themeOriginal"
  | "themeSepia"
  | "themeDark"
  | "themeContrast";

const ThemeSwatch = ({ value }: { value: PageTheme }) => {
  if (value === "high-contrast") {
    return (
      <View style={[styles.themeSwatch, styles.themeSwatchContrast]}>
        <View style={styles.themeSwatchContrastHalfDark} />
        <View style={styles.themeSwatchContrastHalfLight} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.themeSwatch,
        value === "normal" && styles.themeSwatchNormal,
        value === "sepia" && styles.themeSwatchSepia,
        value === "dark" && styles.themeSwatchDark,
      ]}
    />
  );
};

const SettingsSheet: React.FC<SettingsSheetProps> = ({
  engine,
  visible,
  onClose,
}) => {
  const {
    viewMode,
    uiTheme,
    zoom,
    setDocumentState,
    locale,
    accentColor,
    pageTheme,
  } = useViewerStore();
  const isDark = uiTheme === "dark";
  const isPaged = viewMode === "single";
  const isDouble = viewMode === "double";
  const t = getStrings(locale);
  const snapPoints = useMemo(
    () => [Math.min(640, Dimensions.get("window").height * 0.72)],
    []
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleTransition = (mode: "continuous" | "paged") => {
    if (mode === "paged") {
      setDocumentState({ viewMode: "single" });
      return;
    }
    setDocumentState({ viewMode: isDouble ? "double" : "continuous" });
  };

  const handleLayout = (layout: "single" | "double") => {
    if (layout === "double") {
      setDocumentState({ viewMode: "double" });
      return;
    }
    if (viewMode === "double") {
      setDocumentState({ viewMode: "continuous" });
    }
  };

  const handleRotate = (direction: "clockwise" | "counterclockwise") => {
    engine.rotate(direction);
    setDocumentState({ rotation: engine.getRotation() });
  };

  const handleZoom = (delta: number) => {
    const next = Math.max(0.5, Math.min(4, zoom + delta));
    engine.setZoom(next);
    setDocumentState({ zoom: next });
  };

  if (!visible) return null;

  return (
    <View style={styles.modalRoot} pointerEvents="box-none">
      <BottomSheet
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={onClose}
        backdropComponent={renderBackdrop}
        backgroundStyle={[styles.sheetBackground, isDark && styles.sheetDark]}
        handleIndicatorStyle={[styles.handle, isDark && styles.handleDark]}
        handleStyle={styles.handleContainer}
      >
        <BottomSheetScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {t.appearance}
            </Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => setDocumentState({ uiTheme: "light" })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  uiTheme === "light" && styles.optionButtonActive,
                  uiTheme === "light" && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    uiTheme === "light" && styles.optionTextActive,
                  ]}
                >
                  {t.light}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDocumentState({ uiTheme: "dark" })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  uiTheme === "dark" && styles.optionButtonActive,
                  uiTheme === "dark" && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    uiTheme === "dark" && styles.optionTextActive,
                  ]}
                >
                  {t.dark}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {t.pageTheme}
            </Text>
            <View style={styles.themeOptionRow}>
              {PAGE_THEME_OPTIONS.map((option) => {
                const active = pageTheme === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setDocumentState({ pageTheme: option.value })}
                    style={[
                      styles.themeOptionButton,
                      isDark && styles.themeOptionButtonDark,
                      active && styles.themeOptionButtonActive,
                      active && { borderColor: accentColor },
                    ]}
                  >
                    <ThemeSwatch value={option.value} />
                    <Text
                      style={[
                        styles.themeOptionLabel,
                        isDark && styles.themeOptionLabelDark,
                        active && { color: accentColor },
                      ]}
                    >
                      {t[option.labelKey]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {t.pageTransition}
            </Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => handleTransition("continuous")}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  (!isPaged || isDouble) && styles.optionButtonActive,
                  (!isPaged || isDouble) && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    (!isPaged || isDouble) && styles.optionTextActive,
                  ]}
                >
                  {t.continuous}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleTransition("paged")}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  isPaged && styles.optionButtonActive,
                  isPaged && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    isPaged && styles.optionTextActive,
                  ]}
                >
                  {t.pageByPage}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {t.layout}
            </Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => handleLayout("single")}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  !isDouble && styles.optionButtonActive,
                  !isDouble && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    !isDouble && styles.optionTextActive,
                  ]}
                >
                  {t.singlePage}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleLayout("double")}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  isDouble && styles.optionButtonActive,
                  isDouble && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    isDouble && styles.optionTextActive,
                  ]}
                >
                  {t.doublePage}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {t.rotate}
            </Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => handleRotate("counterclockwise")}
                style={[styles.optionButton, isDark && styles.optionButtonDark]}
              >
                <Text
                  style={[styles.optionText, isDark && styles.optionTextDark]}
                >
                  {t.counterclockwise}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleRotate("clockwise")}
                style={[styles.optionButton, isDark && styles.optionButtonDark]}
              >
                <Text
                  style={[styles.optionText, isDark && styles.optionTextDark]}
                >
                  {t.clockwise}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {t.zoom}
            </Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => handleZoom(-0.1)}
                style={[styles.optionButton, isDark && styles.optionButtonDark]}
              >
                <IconZoomOut size={16} color={isDark ? "#e5e7eb" : "#111827"} />
              </Pressable>
              <View style={styles.zoomValue}>
                <Text style={[styles.zoomText, isDark && styles.zoomTextDark]}>
                  {Math.round(zoom * 100)}%
                </Text>
              </View>
              <Pressable
                onPress={() => handleZoom(0.1)}
                style={[styles.optionButton, isDark && styles.optionButtonDark]}
              >
                <IconZoomIn size={16} color={isDark ? "#e5e7eb" : "#111827"} />
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}
            >
              {t.language}
            </Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => setDocumentState({ locale: "en" })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  locale === "en" && styles.optionButtonActive,
                  locale === "en" && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    locale === "en" && styles.optionTextActive,
                  ]}
                >
                  {t.english}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDocumentState({ locale: "pt-BR" })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  locale === "pt-BR" && styles.optionButtonActive,
                  locale === "pt-BR" && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    locale === "pt-BR" && styles.optionTextActive,
                  ]}
                >
                  {t.portuguese}
                </Text>
              </Pressable>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  sheet: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  sheetBackground: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  sheetDark: {
    backgroundColor: "#0f1115",
    borderTopColor: "#1f2937",
  },
  handleContainer: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#cbd5f5",
  },
  handleDark: {
    backgroundColor: "#374151",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  sectionTitleDark: {
    color: "#e5e7eb",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
    marginRight: 8,
    marginBottom: 8,
  },
  optionButtonDark: {
    backgroundColor: "#111827",
  },
  optionButtonActive: {
    backgroundColor: "#2563eb",
  },
  optionText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  optionTextDark: {
    color: "#e5e7eb",
  },
  optionTextActive: {
    color: "#ffffff",
  },
  themeOptionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  themeOptionButton: {
    width: 76,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  themeOptionButtonDark: {
    borderColor: "#374151",
    backgroundColor: "#111827",
  },
  themeOptionButtonActive: {
    borderWidth: 2,
  },
  themeSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginBottom: 8,
    overflow: "hidden",
  },
  themeSwatchNormal: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  themeSwatchSepia: {
    backgroundColor: "#e8dcc3",
    borderWidth: 1,
    borderColor: "#c8b79a",
  },
  themeSwatchDark: {
    backgroundColor: "#10151f",
    borderWidth: 1,
    borderColor: "#2d3748",
  },
  themeSwatchContrast: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#111827",
  },
  themeSwatchContrastHalfDark: {
    flex: 1,
    backgroundColor: "#111827",
  },
  themeSwatchContrastHalfLight: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  themeOptionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  themeOptionLabelDark: {
    color: "#e5e7eb",
  },
  zoomValue: {
    minWidth: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  zoomTextDark: {
    color: "#e5e7eb",
  },
});

export default SettingsSheet;
