import React from "react";
import Animated from "react-native-reanimated";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { MOBILE_CHROME_METRICS } from "../mobileChromeMetrics";
import type { ReaderChromeInsets, ReaderHeaderAction } from "./types";

export interface ReaderHeaderViewProps {
  title: string;
  isDark: boolean;
  visible?: boolean;
  leadingAction?: ReaderHeaderAction;
  trailingAction?: ReaderHeaderAction;
  leadingAccessory?: React.ReactNode;
  centerAccessory?: React.ReactNode;
  trailingAccessory?: React.ReactNode;
  onTitlePress?: () => void;
  titleDisabled?: boolean;
  titleAccessibilityLabel?: string;
  insets?: Partial<ReaderChromeInsets>;
  isLandscape?: boolean;
  testID?: string;
  pointerEvents?: "auto" | "none" | "box-none" | "box-only";
  accessibilityElementsHidden?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ReaderHeaderView({
  title,
  isDark,
  visible = true,
  leadingAction,
  trailingAction,
  leadingAccessory,
  centerAccessory,
  trailingAccessory,
  onTitlePress,
  titleDisabled = false,
  titleAccessibilityLabel,
  insets,
  isLandscape = false,
  testID = "reader-shared-header-frame",
  pointerEvents,
  accessibilityElementsHidden,
  style,
}: ReaderHeaderViewProps) {
  if (!visible) return null;
  const leading = leadingAction ? (
    <Pressable
      onPress={leadingAction.onPress}
      disabled={leadingAction.disabled || !leadingAction.onPress}
      accessibilityRole="button"
      accessibilityLabel={leadingAction.label}
      style={styles.actionHit}
    >
      {leadingAction.content}
    </Pressable>
  ) : leadingAccessory;
  const trailing = trailingAction ? (
    <Pressable
      onPress={trailingAction.onPress}
      disabled={trailingAction.disabled || !trailingAction.onPress}
      accessibilityRole="button"
      accessibilityLabel={trailingAction.label}
      style={styles.actionHit}
    >
      {trailingAction.content}
    </Pressable>
  ) : trailingAccessory;

  return (
    <Animated.View
      pointerEvents={pointerEvents}
      accessibilityElementsHidden={accessibilityElementsHidden}
      importantForAccessibility={accessibilityElementsHidden ? "no-hide-descendants" : "auto"}
      testID={testID}
      style={[
        styles.frame,
        {
          paddingTop: Math.max(0, insets?.top ?? 0),
          paddingLeft: MOBILE_CHROME_METRICS.screenPadding + Math.max(0, insets?.left ?? 0),
          paddingRight: MOBILE_CHROME_METRICS.screenPadding + Math.max(0, insets?.right ?? 0),
        },
        style,
      ]}
    >
      <View
        style={[
          styles.container,
          isDark && styles.containerDark,
          isLandscape && styles.containerLandscape,
        ]}
      >
        <View style={styles.leadingGroup}>{leading}</View>
        {onTitlePress ? (
          <Pressable
            onPress={onTitlePress}
            disabled={titleDisabled}
            accessibilityRole="button"
            accessibilityLabel={titleAccessibilityLabel}
            style={styles.titleHit}
          >
            <Text numberOfLines={1} style={[styles.title, isDark && styles.titleDark]}>
              {title}
            </Text>
          </Pressable>
        ) : (
          <Text
            accessibilityRole="header"
            accessibilityLabel={titleAccessibilityLabel}
            numberOfLines={1}
            style={[styles.title, styles.staticTitle, isDark && styles.titleDark]}
          >
            {title}
          </Text>
        )}
        {centerAccessory ? <View style={styles.centerGroup}>{centerAccessory}</View> : null}
        <View style={styles.trailingGroup}>{trailing}</View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: MOBILE_CHROME_METRICS.screenPadding,
    alignItems: "center",
  },
  container: {
    width: "100%",
    maxWidth: MOBILE_CHROME_METRICS.maxFloatingWidth,
    marginTop: 10,
    paddingHorizontal: 14,
    height: MOBILE_CHROME_METRICS.topbarHeight,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  containerDark: {
    backgroundColor: "rgba(15,17,21,0.88)",
    borderColor: "rgba(71,85,105,0.48)",
  },
  containerLandscape: { maxWidth: undefined, marginTop: 0 },
  leadingGroup: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  actionHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  titleHit: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    justifyContent: "center",
    marginLeft: 8,
    borderRadius: 8,
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#111827",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  staticTitle: { flex: 1, marginHorizontal: 8 },
  titleDark: { color: "#f9fafb" },
  centerGroup: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  trailingGroup: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexShrink: 0, marginLeft: 8 },
});
