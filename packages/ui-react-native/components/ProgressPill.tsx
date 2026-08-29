import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { IconPageNav } from "../icons";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";
import { getProgressPillInteraction } from "./progressPillInteraction";
import { resolveMobileChromeOffsets } from "./mobileChromeMetrics";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";

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
  const offsets = resolveMobileChromeOffsets(usePapyrusSafeAreaInsets());

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
    <View
      pointerEvents="box-none"
      style={[
        styles.frame,
        {
          top: offsets.progress,
          left: 0,
          right: 0,
          paddingLeft:
            offsets.left + MOBILE_CHROME_METRICS.progressHorizontalOffset,
          paddingRight: offsets.right,
        },
      ]}
    >
      <Pressable
        {...getProgressPillInteraction(onPress, onOpenPageJump)}
        style={[
          styles.pill,
          isDark && styles.pillDark,
          { borderColor: `${accentColor}33` },
        ]}
        testID="papyrus-progress-pill"
      >
        <View style={styles.iconHit}>
          <IconPageNav
            size={20}
            color={isDark ? "#f8fafc" : "#111827"}
            strokeWidth={1.8}
          />
        </View>
        <View style={styles.labelHit}>
          <Text style={[styles.label, isDark && styles.labelDark]}>
            {label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    top: 72,
    left: 0,
    right: 0,
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
