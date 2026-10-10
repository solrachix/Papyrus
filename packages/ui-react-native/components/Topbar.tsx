import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Platform,
  type ViewStyle,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { getStrings } from "../mobileStrings";
import { useNativeInkMotion, useNativeInkSession } from "./useNativeInkChrome";
import { IconSettings, IconChevronLeft, IconChevronRight } from "../icons";
import { DocumentEngine } from "@papyrus-sdk/types";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";
import { PageJumpModal } from "./PageJumpModal";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";

export interface TopbarProps {
  engine: DocumentEngine;
  onOpenSettings?: () => void;
  onOpenOverflow?: () => void;
  title?: string;
  logo?: React.ReactNode;
  onLogoPress?: () => void;
  logoAccessibilityLabel?: string;
  showPageNavigationControls?: boolean;
  onOpenPageJump?: () => void;
}

const Topbar: React.FC<TopbarProps> = ({
  engine,
  onOpenSettings,
  onOpenOverflow,
  title,
  logo,
  onLogoPress,
  logoAccessibilityLabel = "Logo",
  showPageNavigationControls = false,
  onOpenPageJump,
}) => {
  const {
    currentPage,
    pageCount,
    uiTheme,
    setDocumentState,
    triggerScrollToPage,
    accentColor,
    mobileChromeVisible,
    locale,
  } = useViewerStore();
  const inkSession = useNativeInkSession();
  const t = getStrings(locale);
  const progress = useNativeInkMotion(inkSession.active, inkSession.supported);
  const settingsMotion = useAnimatedStyle((): ViewStyle => {
    "worklet";
    return {
    opacity: 1 - progress.value,
    transform: [{ scale: 1 - progress.value * 0.04 }, { translateX: -progress.value * 6 }],
    };
  });
  const doneMotion = useAnimatedStyle((): ViewStyle => {
    "worklet";
    return {
    opacity: progress.value,
    transform: [{ scale: 0.96 + progress.value * 0.04 }, { translateX: (1 - progress.value) * 6 }],
    };
  });
  const [jumpModalOpen, setJumpModalOpen] = useState(false);
  const isDark = uiTheme === "dark";
  const navIconColor = isDark ? "#e5e7eb" : "#111827";
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const insets = usePapyrusSafeAreaInsets();

  const navigateToPage = (targetPage: number) => {
    const next = Math.max(1, Math.min(pageCount, targetPage));
    engine.goToPage(next);
    setDocumentState({ currentPage: next });
    triggerScrollToPage(next - 1);
  };

  const handlePageChange = (delta: number) => {
    navigateToPage(currentPage + delta);
  };

  const openJumpModal = () => {
    if (onOpenPageJump) {
      onOpenPageJump();
      return;
    }
    setJumpModalOpen(true);
  };

  const defaultLogo = (
    <View style={[styles.logoBadge, { backgroundColor: accentColor }]}>
      <Text style={styles.logoText}>P</Text>
    </View>
  );
  const logoElement = logo ?? defaultLogo;

  const settingsControl = (
    <Pressable
      onPress={() => onOpenOverflow?.() ?? onOpenSettings?.()}
      style={[styles.iconButton, isDark && styles.iconButtonDark,
        inkSession.supported && styles.annotationSettingsButton]}
      accessibilityRole="button"
      accessibilityLabel="Open overflow menu"
      disabled={inkSession.active}
    >
      <IconSettings size={MOBILE_CHROME_METRICS.iconSize} color={isDark ? "#e5e7eb" : "#111827"} />
    </Pressable>
  );

  if (!mobileChromeVisible && !inkSession.active) return null;

  return (
    <>
      <View
        style={[
          styles.chromeFrame,
          {
            paddingTop: insets.top,
            paddingLeft: MOBILE_CHROME_METRICS.screenPadding + insets.left,
            paddingRight: MOBILE_CHROME_METRICS.screenPadding + insets.right,
          },
        ]}
        pointerEvents="box-none"
        testID="papyrus-floating-top-controls"
      >
        <View
          style={[
            styles.container,
            Platform.OS === "ios" && styles.containerIos,
            isDark && styles.containerDark,
            isLandscape && styles.containerLandscape,
          ]}
        >
          <View style={styles.leftGroup}>
            {onLogoPress ? (
              <Pressable
                onPress={() => {
                  // Keep the viewer mounted so the existing native flush and
                  // JS annotation persistence can finish before navigation.
                  if (inkSession.active) inkSession.finish();
                  else onLogoPress();
                }}
                accessibilityRole="button"
                accessibilityLabel={logoAccessibilityLabel}
                style={styles.logoSlot}
              >
                {logoElement}
              </Pressable>
            ) : (
              <View style={styles.logoSlot}>{logoElement}</View>
            )}
            <Pressable
              onPress={openJumpModal}
              disabled={pageCount <= 0}
              style={styles.titleHit}
              accessibilityLabel="Open page jump"
            >
              <Text
                numberOfLines={1}
                style={[styles.brandText, isDark && styles.brandTextDark]}
              >
                {title ?? "Papyrus"}
              </Text>
            </Pressable>
          </View>

          {showPageNavigationControls ? (
            <View style={styles.pageGroup}>
              <>
                <Pressable
                  onPress={() => handlePageChange(-1)}
                  style={[styles.pageButton, isDark && styles.pageButtonDark]}
                >
                  <IconChevronLeft
                    size={MOBILE_CHROME_METRICS.iconSize}
                    color={navIconColor}
                  />
                </Pressable>
                <Pressable
                  onPress={openJumpModal}
                  style={styles.pageIndicatorHit}
                  accessibilityLabel="Page jump"
                >
                  <Text
                    style={[
                      styles.pageIndicator,
                      isDark && styles.pageIndicatorDark,
                    ]}
                  >
                    {currentPage}/{pageCount}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handlePageChange(1)}
                  style={[styles.pageButton, isDark && styles.pageButtonDark]}
                >
                  <IconChevronRight
                    size={MOBILE_CHROME_METRICS.iconSize}
                    color={navIconColor}
                  />
                </Pressable>
              </>
            </View>
          ) : null}

          <View
            style={[styles.rightGroup, inkSession.supported && styles.annotationActionSlot]}
            testID="papyrus-topbar-action-slot"
          >
            {inkSession.supported ? (
              <>
                <Animated.View
                  style={[styles.settingsSlot, settingsMotion]}
                  pointerEvents={inkSession.active ? "none" : "auto"}
                  accessibilityElementsHidden={inkSession.active}
                  importantForAccessibility={inkSession.active ? "no-hide-descendants" : "auto"}
                >
                  {settingsControl}
                </Animated.View>
                <Animated.View
                  style={[styles.doneSlot, doneMotion]}
                  pointerEvents={inkSession.active ? "auto" : "none"}
                  accessibilityElementsHidden={!inkSession.active}
                  importantForAccessibility={inkSession.active ? "auto" : "no-hide-descendants"}
                >
                  <Pressable
                    onPress={inkSession.finish}
                    disabled={!inkSession.active}
                    style={styles.doneButton}
                    accessibilityRole="button"
                    accessibilityLabel={t.done}
                    testID="papyrus-topbar-ink-done"
                  >
                    <Text style={styles.doneButtonText}>✓ {t.done}</Text>
                  </Pressable>
                </Animated.View>
              </>
            ) : settingsControl}
          </View>
        </View>
      </View>

      <PageJumpModal
        visible={jumpModalOpen}
        currentPage={currentPage}
        pageCount={pageCount}
        isDark={isDark}
        accentColor={accentColor}
        onClose={() => setJumpModalOpen(false)}
        onConfirm={navigateToPage}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: MOBILE_CHROME_METRICS.maxFloatingWidth,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  containerIos: {
    height: MOBILE_CHROME_METRICS.topbarHeight,
    paddingVertical: 6,
  },
  containerLandscape: {
    maxWidth: undefined,
    marginTop: 0,
  },
  chromeFrame: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: MOBILE_CHROME_METRICS.screenPadding,
    alignItems: "center",
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  logoSlot: {
    marginRight: 8,
    borderRadius: 10,
  },
  logoText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  brandText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#111827",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  brandTextDark: {
    color: "#f9fafb",
  },
  titleHit: {
    minHeight: 32,
    justifyContent: "center",
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    borderRadius: 8,
  },
  pageGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  pageButton: {
    width: MOBILE_CHROME_METRICS.topbarPageButtonSize,
    height: MOBILE_CHROME_METRICS.topbarPageButtonSize,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  pageButtonDark: {
    backgroundColor: "#111827",
  },
  pageButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },
  pageButtonTextDark: {
    color: "#e5e7eb",
  },
  pageIndicator: {
    fontSize: 12,
    color: "#374151",
    minWidth: 52,
    textAlign: "center",
    marginHorizontal: 6,
    fontWeight: "700",
  },
  pageIndicatorDark: {
    color: "#d1d5db",
  },
  pageIndicatorHit: {
    minWidth: 62,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    marginLeft: 12,
  },
  annotationActionSlot: {
    width: 108,
    height: 44,
  },
  settingsSlot: {
    position: "absolute",
    right: 0,
    top: 0,
  },
  annotationSettingsButton: {
    minWidth: 44,
    minHeight: 44,
    marginLeft: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  doneSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  doneButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    marginLeft: 6,
  },
  iconButtonDark: {
    backgroundColor: "#111827",
  },
  iconButtonActive: {
    backgroundColor: "#2563eb",
  },
  iconButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  iconButtonTextDark: {
    color: "#e5e7eb",
  },
  iconButtonTextActive: {
    color: "#ffffff",
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconRowSpacer: {
    width: 6,
  },
});

export default Topbar;
