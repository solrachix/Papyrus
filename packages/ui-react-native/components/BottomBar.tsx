import React from "react";
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useNativeInkMotion, useNativeInkSession } from "./useNativeInkChrome";
import { DocumentType, MobilePrimaryDestination } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import {
  IconComment,
  IconChevronLeft,
  IconChevronRight,
  IconInfo,
  IconSearch,
  IconSettings,
  IconToolDockTrigger,
} from "../icons";
import { buildBottomBarLayout, BottomBarSlotKey } from "./bottomBarModel";
import { getToolDockDismissState } from "../gesture/selectionInteraction";
import {
  createOpenDestinationHandler,
  resolveAnnotateButtonAction,
} from "./BottomBar.actions";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";
import { resolveMobileChromeOffsets } from "./mobileChromeMetrics";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";

type BottomBarProps = {
  documentType: DocumentType;
  onOpenInfo: () => void;
  onOpenSettings: () => void;
  onTurnPage?: (direction: -1 | 1) => void;
  onNavigateToPage?: (page: number) => void;
  onOpenPages?: () => void;
  onOpenDestination?: (destination: MobilePrimaryDestination) => void;
};

const BottomBar: React.FC<BottomBarProps> = ({
  documentType,
  onOpenInfo,
  onOpenSettings,
  onOpenDestination,
  onTurnPage, onNavigateToPage, onOpenPages,
}) => {
  const {
    activeMobileDestination,
    viewMode, epubReadingMode, epubLocation, comicLayoutMode, currentPage, pageCount,
    mobileDockVisible,
    setDocumentState,
    uiTheme,
    locale,
    accentColor,
    mobileChromeVisible,
    toolDockOpen,
    activeTool,
    interactionMode,
  } = useViewerStore();
  const inkSession = useNativeInkSession();
  const supportsInkChrome = documentType === "pdf" && inkSession.supported;
  const drawing = supportsInkChrome && inkSession.active;
  const dockVisible = mobileChromeVisible && mobileDockVisible && !drawing;
  const dockProgress = useNativeInkMotion(dockVisible, supportsInkChrome || documentType === "epub");
  const dockMotion = useAnimatedStyle(() => {
    "worklet";
    return {
    opacity: dockProgress.value,
    transform: [{ translateY: (1 - dockProgress.value) * 8 }],
    };
  });
  const isDark = uiTheme === "dark";
  const t = getStrings(locale);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const offsets = resolveMobileChromeOffsets(usePapyrusSafeAreaInsets());

  const iconColor = (active: boolean) => {
    if (active) return accentColor;
    return isDark ? "#e5e7eb" : "#111827";
  };

  const layout = buildBottomBarLayout({
    documentType,
    activeMobileDestination,
    toolDockOpen,
  });

  const paginated = documentType !== "text" && (documentType === "comic" ? comicLayoutMode === "single" : documentType === "epub" ? epubReadingMode === "paged" : viewMode === "single");
  if (paginated) {
    layout.leftSlots.push(...layout.rightSlots.filter(slot => slot.key === "search"));
    layout.rightSlots = [];
  }
  const turnPage = (direction: -1 | 1) => {
    if (onTurnPage) onTurnPage(direction);
    else onNavigateToPage?.(currentPage + direction);
  };

  const slotMeta: Record<
    BottomBarSlotKey,
    {
      label: string;
      icon: React.ComponentType<{ size?: number; color?: string }>;
      onPress: () => void;
    }
  > = {
    annotate: {
      label: t.tools,
      icon: IconToolDockTrigger,
      onPress: () => {
        const isNativeIosInkViewer = supportsInkChrome;
        const action = resolveAnnotateButtonAction({
          isNativeIosInkViewer,
          activeTool,
          toolDockOpen,
        });
        if (action === "activate-native-ink") {
          setDocumentState({
            activeTool: "ink",
            activeDrawToolPreset: "ink",
            interactionMode: "pan",
            toolDockOpen: false,
            activeMobileDestination: "none",
          });
          return;
        }
        if (action === "deactivate-native-ink") {
          inkSession.finish();
          return;
        }
        if (action === "dismiss-tool-dock") {
          setDocumentState({
            ...getToolDockDismissState({
              activeTool,
              interactionMode,
            }),
            activeMobileDestination: "none",
          });
          return;
        }
        onOpenDestination?.("annotate");
        setDocumentState({ toolDockOpen: true });
      },
    },
    notes: {
      label: t.notes,
      icon: IconComment,
      onPress: createOpenDestinationHandler(onOpenDestination, "notes"),
    },
    search: {
      label: t.search,
      icon: IconSearch,
      onPress: createOpenDestinationHandler(onOpenDestination, "search"),
    },
    info: {
      label: t.info,
      icon: IconInfo,
      onPress: onOpenInfo,
    },
    more: {
      label: t.more,
      icon: IconSettings,
      onPress: onOpenSettings,
    },
  };

  if (!dockVisible && !supportsInkChrome && documentType !== "epub") return null;

  return (
    <Animated.View
      pointerEvents={dockVisible ? "box-none" : "none"}
      accessibilityElementsHidden={!dockVisible}
      importantForAccessibility={dockVisible ? "auto" : "no-hide-descendants"}
      testID="papyrus-bottom-bar-frame"
      style={[styles.frame, { paddingBottom: offsets.bottom, paddingLeft: offsets.left, paddingRight: offsets.right }, dockMotion]}
    >
      <View style={[styles.row, isLandscape && styles.rowLandscape]}>
        {layout.leftSlots.length > 0 ? (
          <View
            style={[
              styles.island,
              styles.editIsland,
              isDark && styles.islandDark,
            ]}
            testID="papyrus-floating-bottom-dock-edit"
          >
            {layout.leftSlots.map((slot) => {
              const meta = slotMeta[slot.key];
              const Icon = meta.icon;
              return (
                <Pressable
                  key={slot.key}
                  disabled={!dockVisible}
                  onPress={meta.onPress}
                  style={[
                    styles.iconOnlyItem,
                    slot.active && styles.itemActive,
                  ]}
                  accessibilityLabel={meta.label}
                  testID={`papyrus-mobile-destination-${slot.key}`}
                >
                  <View
                    style={[
                      styles.itemIcon,
                      isDark && styles.itemIconDark,
                      slot.active && styles.itemIconActive,
                    ]}
                  >
                    <Icon
                      size={MOBILE_CHROME_METRICS.iconSize}
                      color={iconColor(slot.active)}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View
          style={[
            styles.island,
            styles.utilityIsland,
            isDark && styles.islandDark,
          ]}
          testID="papyrus-floating-bottom-dock"
        >
          {paginated ? <>
            <Pressable accessibilityRole="button" accessibilityLabel={locale === "pt-BR" ? "Página anterior" : "Previous page"} disabled={!dockVisible || (documentType === "epub" ? epubLocation?.atStart : !onTurnPage && currentPage <= 1)} onPress={() => turnPage(-1)} style={styles.iconOnlyItem}>
              <IconChevronLeft size={MOBILE_CHROME_METRICS.iconSize} color={iconColor(false)} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={locale === "pt-BR" ? "Ir para página" : "Go to page"} onPress={onOpenPages} style={[styles.iconOnlyItem,{minWidth:56}]}>
              <Text style={{color:iconColor(false),fontWeight:"700",fontSize:13,lineHeight:18,includeFontPadding:false}}>{documentType === "epub" ? (epubLocation?.visualPage ? `Cap. ${epubLocation.chapter} · ${epubLocation.visualPage}/${epubLocation.visualPageCount}` : `Cap. ${currentPage}`) : `${currentPage}/${pageCount}`}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={locale === "pt-BR" ? "Próxima página" : "Next page"} disabled={!dockVisible || (documentType === "epub" ? epubLocation?.atEnd : !onTurnPage && currentPage >= pageCount)} onPress={() => turnPage(1)} style={styles.iconOnlyItem}>
              <IconChevronRight size={MOBILE_CHROME_METRICS.iconSize} color={iconColor(false)} />
            </Pressable>
          </> : layout.rightSlots.map((slot) => {
            const meta = slotMeta[slot.key];
            const Icon = meta.icon;
            return (
              <Pressable
                key={slot.key}
                disabled={!dockVisible}
                onPress={meta.onPress}
                style={[styles.iconOnlyItem, slot.active && styles.itemActive]}
                accessibilityLabel={meta.label}
                testID={`papyrus-mobile-destination-${slot.key}`}
              >
                <View
                  style={[
                    styles.itemIcon,
                    isDark && styles.itemIconDark,
                    slot.active && styles.itemIconActive,
                  ]}
                >
                  <Icon
                    size={MOBILE_CHROME_METRICS.iconSize}
                    color={iconColor(slot.active)}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: MOBILE_CHROME_METRICS.screenPadding,
    paddingBottom: 14,
    alignItems: "center",
  },
  row: {
    width: "100%",
    maxWidth: MOBILE_CHROME_METRICS.maxFloatingWidth,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 10,
  },
  rowLandscape: {
    maxWidth: undefined,
  },
  island: {
    flexDirection: "row",
    alignItems: "center",
    height: MOBILE_CHROME_METRICS.bottomBarVisualHeight,
    paddingVertical: 0,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  editIsland: {
    minWidth: 54,
    justifyContent: "center",
    gap: 2,
  },
  utilityIsland: {
    justifyContent: "center",
    gap: 2,
    marginLeft: "auto",
  },
  islandDark: {
    backgroundColor: "rgba(15,17,21,0.9)",
    borderColor: "rgba(71,85,105,0.48)",
  },
  iconOnlyItem: {
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: MOBILE_CHROME_METRICS.bottomBarItemPaddingHorizontal,
    paddingVertical: MOBILE_CHROME_METRICS.bottomBarItemPaddingVertical,
  },
  itemActive: {
    transform: [{ translateY: -2 }],
  },
  itemIcon: {
    width: MOBILE_CHROME_METRICS.iconBoxSize,
    height: MOBILE_CHROME_METRICS.iconBoxSize,
    borderRadius: 0,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  itemIconDark: {
    backgroundColor: "transparent",
    color: "#e5e7eb",
  },
  itemIconActive: {
    backgroundColor: "transparent",
    color: "#ffffff",
  },
});

export default BottomBar;
