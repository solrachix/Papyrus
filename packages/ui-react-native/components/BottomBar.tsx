import React from "react";
import { useWindowDimensions } from "react-native";
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
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";
import ReaderBottomControlsView from "./sharedReaderChrome/ReaderBottomControlsView";

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
  const safeInsets = usePapyrusSafeAreaInsets();

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

  const toSharedActions = (slots: typeof layout.leftSlots) => slots.map((slot) => {
    const meta = slotMeta[slot.key];
    const Icon = meta.icon;
    return {
      key: slot.key,
      label: meta.label,
      icon: <Icon size={MOBILE_CHROME_METRICS.iconSize} color={iconColor(slot.active)} />,
      onPress: meta.onPress,
      active: slot.active,
    };
  });

  const previousCanNavigate = documentType === "epub"
    ? !epubLocation?.atStart
    : Boolean(onTurnPage || currentPage > 1);
  const nextCanNavigate = documentType === "epub"
    ? !epubLocation?.atEnd
    : Boolean(onTurnPage || currentPage < pageCount);
  const progressLabel = documentType === "epub"
    ? (epubLocation?.visualPage
      ? `Cap. ${epubLocation.chapter} · ${epubLocation.visualPage}/${epubLocation.visualPageCount}`
      : `Cap. ${currentPage}`)
    : `${currentPage}/${pageCount}`;

  const navigation = paginated ? {
    canGoBackward: previousCanNavigate,
    canGoForward: nextCanNavigate,
    progressLabel,
    onPrevious: () => turnPage(-1),
    onOpenProgress: onOpenPages,
    onNext: () => turnPage(1),
    previousLabel: locale === "pt-BR" ? "Página anterior" : "Previous page",
    nextLabel: locale === "pt-BR" ? "Próxima página" : "Next page",
    previousIcon: <IconChevronLeft size={MOBILE_CHROME_METRICS.iconSize} color={iconColor(false)} />,
    nextIcon: <IconChevronRight size={MOBILE_CHROME_METRICS.iconSize} color={iconColor(false)} />,
  } : undefined;

  return (
    <Animated.View
      pointerEvents={dockVisible ? "box-none" : "none"}
      accessibilityElementsHidden={!dockVisible}
      importantForAccessibility={dockVisible ? "auto" : "no-hide-descendants"}
      style={dockMotion}
    >
      <ReaderBottomControlsView
        visible
        enabled={dockVisible}
        isDark={isDark}
        accentColor={accentColor}
        primaryActions={toSharedActions(layout.leftSlots)}
        secondaryActions={paginated ? [] : toSharedActions(layout.rightSlots)}
        navigation={navigation}
        insets={safeInsets}
        isLandscape={isLandscape}
        testID="papyrus-bottom-bar-frame"
        actionTestIDPrefix="papyrus-mobile-destination"
        editIslandTestID="papyrus-floating-bottom-dock-edit"
        utilityIslandTestID="papyrus-floating-bottom-dock"
        showUtilityIsland
        pointerEvents={dockVisible ? "box-none" : "none"}
        accessibilityElementsHidden={!dockVisible}
      />
    </Animated.View>
  );
};

export default BottomBar;
