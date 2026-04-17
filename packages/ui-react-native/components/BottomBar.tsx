import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType, MobilePrimaryDestination } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import {
  IconComment,
  IconInfo,
  IconSearch,
  IconSettings,
  IconToolDockTrigger,
} from "../icons";
import { buildBottomBarLayout, BottomBarSlotKey } from "./bottomBarModel";
import { getToolDockDismissState } from "../gesture/selectionInteraction";
import { createOpenDestinationHandler } from "./BottomBar.actions";
import { MOBILE_CHROME_METRICS } from "./mobileChromeMetrics";

type BottomBarProps = {
  documentType: DocumentType;
  onOpenInfo: () => void;
  onOpenSettings: () => void;
  onOpenDestination?: (destination: MobilePrimaryDestination) => void;
};

const BottomBar: React.FC<BottomBarProps> = ({
  documentType,
  onOpenInfo,
  onOpenSettings,
  onOpenDestination,
}) => {
  const {
    activeMobileDestination,
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
  const isDark = uiTheme === "dark";
  const t = getStrings(locale);

  const iconColor = (active: boolean) => {
    if (active) return accentColor;
    return isDark ? "#e5e7eb" : "#111827";
  };

  const layout = buildBottomBarLayout({
    documentType,
    activeMobileDestination,
    toolDockOpen,
  });

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
        if (toolDockOpen) {
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

  if (!mobileChromeVisible || !mobileDockVisible) return null;

  return (
    <View pointerEvents="box-none" style={styles.frame}>
      <View style={styles.row}>
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
                  onPress={meta.onPress}
                  style={[
                    styles.iconOnlyItem,
                    slot.active && styles.itemActive,
                  ]}
                  accessibilityLabel={meta.label}
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
          {layout.rightSlots.map((slot) => {
            const meta = slotMeta[slot.key];
            const Icon = meta.icon;
            return (
              <Pressable
                key={slot.key}
                onPress={meta.onPress}
                style={[styles.iconOnlyItem, slot.active && styles.itemActive]}
                accessibilityLabel={meta.label}
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
    </View>
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
  island: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
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
