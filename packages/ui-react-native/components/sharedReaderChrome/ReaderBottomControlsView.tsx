import React from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MOBILE_CHROME_METRICS } from "../mobileChromeMetrics";
import type { ReaderBottomAction } from "./types";

export interface ReaderBottomNavigation {
  canGoBackward: boolean;
  canGoForward: boolean;
  progressLabel: string;
  progressFraction?: number;
  onPrevious?: () => void;
  onOpenProgress?: () => void;
  onNext?: () => void;
  previousLabel: string;
  nextLabel: string;
  progressAccessibilityHint?: string;
  previousIcon?: React.ReactNode;
  nextIcon?: React.ReactNode;
}

export interface ReaderBottomControlsViewProps {
  visible: boolean;
  enabled?: boolean;
  isDark: boolean;
  accentColor: string;
  primaryActions?: ReaderBottomAction[];
  secondaryActions?: ReaderBottomAction[];
  navigation?: ReaderBottomNavigation;
  insets?: { bottom?: number; left?: number; right?: number };
  testID?: string;
  actionTestIDPrefix?: string;
  editIslandTestID?: string;
  utilityIslandTestID?: string;
  showUtilityIsland?: boolean;
  isLandscape?: boolean;
  accessibilityElementsHidden?: boolean;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  style?: StyleProp<ViewStyle>;
}

export default function ReaderBottomControlsView({
  visible,
  enabled = true,
  isDark,
  accentColor,
  primaryActions = [],
  secondaryActions = [],
  navigation,
  insets,
  testID = "reader-shared-bottom-bar-frame",
  actionTestIDPrefix = "reader-shared-action",
  editIslandTestID = "reader-shared-bottom-edit-island",
  utilityIslandTestID = "reader-shared-bottom-utility-island",
  showUtilityIsland = false,
  isLandscape = false,
  accessibilityElementsHidden,
  pointerEvents = "box-none",
  style,
}: ReaderBottomControlsViewProps) {
  if (!visible) return null;
  const renderAction = (action: ReaderBottomAction) => (
    <Pressable
      key={action.key}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ selected: Boolean(action.active), disabled: Boolean(!enabled || action.disabled || !action.onPress) }}
      disabled={!enabled || action.disabled || !action.onPress}
      onPress={action.onPress}
      style={[styles.iconOnlyItem, action.active && styles.itemActive]}
      testID={`${actionTestIDPrefix}-${action.key}`}
    >
      <View style={styles.itemIcon}>{action.icon}</View>
    </Pressable>
  );

  const fraction = typeof navigation?.progressFraction === "number" && Number.isFinite(navigation.progressFraction)
    ? Math.min(1, Math.max(0, navigation.progressFraction))
    : undefined;

  return (
    <View
      pointerEvents={pointerEvents}
      accessibilityElementsHidden={accessibilityElementsHidden ?? !enabled}
      importantForAccessibility={(accessibilityElementsHidden ?? !enabled) ? "no-hide-descendants" : "auto"}
      testID={testID}
      style={[
        styles.frame,
        {
          paddingBottom: Math.max(0, insets?.bottom ?? 0) + 14,
          paddingLeft: MOBILE_CHROME_METRICS.screenPadding + Math.max(0, insets?.left ?? 0),
          paddingRight: MOBILE_CHROME_METRICS.screenPadding + Math.max(0, insets?.right ?? 0),
        },
        style,
      ]}
    >
      <View style={[styles.row, isLandscape && styles.rowLandscape]}>
        {primaryActions.length > 0 ? (
          <View testID={editIslandTestID} style={[styles.island, styles.editIsland, isDark && styles.islandDark]}>
            {primaryActions.map(renderAction)}
          </View>
        ) : null}
        {secondaryActions.length > 0 || navigation || showUtilityIsland ? (
          <View testID={utilityIslandTestID} style={[styles.island, styles.utilityIsland, isDark && styles.islandDark]}>
            {navigation ? (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel={navigation.previousLabel} accessibilityState={{ disabled: !enabled || !navigation.canGoBackward || !navigation.onPrevious }} disabled={!enabled || !navigation.canGoBackward || !navigation.onPrevious} onPress={navigation.onPrevious} style={styles.iconOnlyItem}>
                  {navigation.previousIcon ?? null}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={navigation.progressLabel}
                  accessibilityHint={navigation.progressAccessibilityHint}
                  accessibilityState={{ disabled: !enabled || !navigation.onOpenProgress }}
                  disabled={!enabled || !navigation.onOpenProgress}
                  onPress={navigation.onOpenProgress}
                  style={styles.progressHit}
                >
                  <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.progressLabel, isDark && styles.progressLabelDark]}>{navigation.progressLabel}</Text>
                  {fraction !== undefined ? (
                    <View style={styles.progressTrack} testID="reader-shared-progress-track">
                      <View style={[styles.progressValue, { width: `${fraction * 100}%`, backgroundColor: accentColor }]} testID="reader-shared-progress-value" />
                    </View>
                  ) : null}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={navigation.nextLabel} accessibilityState={{ disabled: !enabled || !navigation.canGoForward || !navigation.onNext }} disabled={!enabled || !navigation.canGoForward || !navigation.onNext} onPress={navigation.onNext} style={styles.iconOnlyItem}>
                  {navigation.nextIcon ?? null}
                </Pressable>
              </>
            ) : secondaryActions.map(renderAction)}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, alignItems: "center" },
  row: { width: "100%", maxWidth: MOBILE_CHROME_METRICS.maxFloatingWidth, flexDirection: "row", justifyContent: "flex-start", alignItems: "center", gap: 10 },
  rowLandscape: { maxWidth: undefined },
  island: { flexDirection: "row", alignItems: "center", height: MOBILE_CHROME_METRICS.bottomBarVisualHeight, paddingVertical: 0, paddingHorizontal: 6, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "rgba(255,255,255,0.72)", borderRadius: 24, shadowColor: "#0f172a", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 },
  editIsland: { minWidth: 54, justifyContent: "center", gap: 2 },
  utilityIsland: { justifyContent: "center", gap: 2, marginLeft: "auto" },
  islandDark: { backgroundColor: "rgba(15,17,21,0.9)", borderColor: "rgba(71,85,105,0.48)" },
  iconOnlyItem: { minWidth: 44, height: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: MOBILE_CHROME_METRICS.bottomBarItemPaddingHorizontal, paddingVertical: MOBILE_CHROME_METRICS.bottomBarItemPaddingVertical },
  itemActive: { transform: [{ translateY: -2 }] },
  itemIcon: { width: MOBILE_CHROME_METRICS.iconBoxSize, height: MOBILE_CHROME_METRICS.iconBoxSize, alignItems: "center", justifyContent: "center" },
  progressHit: { flex: 1, minWidth: 62, height: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 8 },
  progressLabel: { maxWidth: 150, color: "#111827", fontSize: 12, lineHeight: 16, fontWeight: "700", textAlign: "center" },
  progressLabelDark: { color: "#e5e7eb" },
  progressTrack: { width: "100%", height: 2, marginTop: 3, backgroundColor: "rgba(127,127,127,0.3)", borderRadius: 1, overflow: "hidden" },
  progressValue: { height: "100%", borderRadius: 1 },
});
