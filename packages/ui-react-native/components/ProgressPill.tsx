import React, { useMemo, useRef } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { IconPageNav } from "../icons";
import { getProgressPillInteraction } from "./progressPillInteraction";
import { resolveMobileChromeOffsets } from "./mobileChromeMetrics";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";
import { resolvePageScrubberPage } from "./pageScrubberModel";

type ProgressPillProps = {
  documentType: DocumentType;
  onPress: () => void;
  onOpenPageJump?: () => void;
  onNavigateToPage?: (page: number) => void;
};

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export function ProgressPill({
  documentType,
  onPress,
  onOpenPageJump,
  onNavigateToPage,
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
  const { height: windowHeight } = useWindowDimensions();
  const trackHeight = Math.max(
    180,
    Math.min(520, windowHeight - offsets.progress - offsets.bottom - 132)
  );
  const thumbHeight = 44;
  const trackYRef = useRef(0);
  const scrubberRef = useRef<View>(null);
  const lastScrubbedPageRef = useRef<number | null>(null);

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

  const scrubToPosition = (position: number) => {
    const nextPage = resolvePageScrubberPage({
      position,
      trackHeight,
      thumbHeight,
      pageCount,
    });
    if (nextPage === null || nextPage === lastScrubbedPageRef.current) return;
    lastScrubbedPageRef.current = nextPage;
    onNavigateToPage?.(nextPage);
  };

  const scrubberResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gestureState) =>
      Math.abs(gestureState.dy) > 4,
    onPanResponderGrant: (_, gestureState) => {
      scrubToPosition(gestureState.y0 - trackYRef.current);
    },
    onPanResponderMove: (_, gestureState) => {
      scrubToPosition(gestureState.moveY - trackYRef.current);
    },
    onPanResponderRelease: () => {
      lastScrubbedPageRef.current = null;
    },
    onPanResponderTerminate: () => {
      lastScrubbedPageRef.current = null;
    },
  });

  const progressRatio =
    pageCount <= 1
      ? 0
      : Math.max(0, Math.min(1, (currentPage - 1) / (pageCount - 1)));
  const thumbTop = progressRatio * (trackHeight - thumbHeight);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.frame,
        {
          top: offsets.progress,
          right: offsets.right,
        },
      ]}
    >
      <View
        ref={scrubberRef}
        style={[styles.scrubber, { height: trackHeight }]}
        {...scrubberResponder.panHandlers}
        onLayout={() => {
          scrubberRef.current?.measureInWindow((_x, y) => {
            trackYRef.current = y;
          });
        }}
      >
        <View style={[styles.track, isDark && styles.trackDark]} />
        <View style={[styles.thumb, { top: thumbTop }]}>
          <Pressable
            {...getProgressPillInteraction(onPress, onOpenPageJump)}
            style={[
              styles.pill,
              isDark && styles.pillDark,
              { borderColor: `${accentColor}33` },
            ]}
            testID="papyrus-progress-pill"
          >
            <View style={styles.labelHit}>
              <Text style={[styles.label, isDark && styles.labelDark]}>
                {label}
              </Text>
            </View>
            <View style={styles.iconHit}>
              <IconPageNav
                size={20}
                color={isDark ? "#f8fafc" : "#111827"}
                strokeWidth={1.8}
              />
            </View>
          </Pressable>
        </View>
      </View>
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
    alignItems: "flex-end",
    zIndex: 18,
  },
  scrubber: {
    width: 132,
    position: "relative",
    marginRight: 4,
  },
  track: {
    position: "absolute",
    top: 0,
    right: 30,
    bottom: 0,
    width: 3,
    borderRadius: 2,
    backgroundColor: "rgba(15,23,42,0.16)",
  },
  trackDark: {
    backgroundColor: "rgba(248,250,252,0.22)",
  },
  thumb: {
    position: "absolute",
    right: 0,
    height: 44,
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
