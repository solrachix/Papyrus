import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { IconPageNav } from "../icons";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";

type ProgressPillProps = {
  documentType: DocumentType;
  onPress: () => void;
  onOpenPageJump?: () => void;
};

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export function ProgressPill({
  documentType,
  onPress,
  onOpenPageJump,
}: ProgressPillProps) {
  const {
    currentPage,
    pageCount,
    uiTheme,
    accentColor,
    mobileChromeVisible,
    mobileProgressPillVisible,
  } = useViewerStore();
  const isDark = uiTheme === "dark";

  const label = useMemo(() => {
    const total = Math.max(pageCount, 1);
    const percent = clampPercent((currentPage / total) * 100);

    if (documentType === "pdf") {
      return `${currentPage}/${pageCount || 0}`;
    }

    if (documentType === "epub") {
      return `Cap. ${currentPage} · ${percent}%`;
    }

    return `${percent}%`;
  }, [currentPage, documentType, pageCount]);

  if (!mobileChromeVisible || !mobileProgressPillVisible) return null;

  return (
    <View pointerEvents="box-none" style={styles.frame}>
      <View
        accessibilityLabel="Open document navigation"
        style={[
          styles.pill,
          isDark && styles.pillDark,
          { borderColor: `${accentColor}33` },
        ]}
        testID="papyrus-progress-pill"
      >
        <Pressable
          onPress={onPress}
          style={styles.iconHit}
          accessibilityLabel="Open document navigation"
        >
          <IconPageNav
            size={20}
            color={isDark ? "#f8fafc" : "#111827"}
            strokeWidth={1.8}
          />
        </Pressable>
        <Pressable
          onPress={onPress}
          onLongPress={onOpenPageJump}
          style={styles.labelHit}
          accessibilityLabel="Open page jump"
        >
          <Text style={[styles.label, isDark && styles.labelDark]}>{label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    top: 72,
    left: MOBILE_CHROME_METRICS.screenPadding,
    right: MOBILE_CHROME_METRICS.screenPadding,
    bottom: "auto",
    alignItems: "flex-start",
    zIndex: 18,
  },
  pill: {
    minWidth: 92,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.88)",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  iconHit: {
    borderRadius: 8,
  },
  labelHit: {
    borderRadius: 8,
  },
  pillDark: {
    backgroundColor: "rgba(15,17,21,0.88)",
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
  },
  labelDark: {
    color: "#f8fafc",
  },
});
