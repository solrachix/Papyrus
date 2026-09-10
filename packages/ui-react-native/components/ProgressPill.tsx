import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { IconPageNav } from "../icons";
import { resolveMobileChromeOffsets } from "./mobileChromeMetrics";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";
import {
  createPageScrubberNavigationController,
  resolvePageScrubberPage,
  resolvePageScrubberReleaseAction,
  resolvePageScrubberTouchPolicy,
  resolvePageScrubberThumbTop,
  resolvePageScrubberThumbTopFromPosition,
  shouldRenderPageScrubber,
} from "./pageScrubberModel";

type ProgressPillProps = {
  documentType: DocumentType;
  onPress: () => void;
  onOpenPageJump?: () => void;
  onNavigateToPage?: (page: number) => void;
  onScrubbingChange?: (active: boolean) => void;
};

const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export function ProgressPill({
  documentType,
  onPress,
  onOpenPageJump,
  onNavigateToPage,
  onScrubbingChange,
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
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const isScrubbingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const longPressTriggeredRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingReleasedScrubPageRef = useRef<number | null>(null);
  const [scrubPreviewPage, setScrubPreviewPage] = useState<number | null>(null);
  const onNavigateToPageRef = useRef(onNavigateToPage);
  const onPressRef = useRef(onPress);
  const onOpenPageJumpRef = useRef(onOpenPageJump);
  const onScrubbingChangeRef = useRef(onScrubbingChange);
  onScrubbingChangeRef.current = onScrubbingChange;
  const scrubToPositionRef = useRef<(position: number) => void>(() => {});
  const scrubNavigationControllerRef = useRef(
    createPageScrubberNavigationController((page) => {
      onNavigateToPageRef.current?.(page);
    }),
  );
  const scrubberResponderRef = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const touchPolicy = resolvePageScrubberTouchPolicy();

  const displayedPage = scrubPreviewPage ?? currentPage;
  const label = useMemo(() => {
    const total = Math.max(pageCount, 1);
    const percent = clampPercent((displayedPage / total) * 100);

    if (documentType === "pdf") {
      return `${displayedPage}/${pageCount || 0}`;
    }

    if (documentType === "epub") {
      return `Cap. ${displayedPage} · ${percent}%`;
    }

    return `${percent}%`;
  }, [displayedPage, documentType, pageCount]);

  const thumbTop = resolvePageScrubberThumbTop({
    currentPage,
    trackHeight,
    thumbHeight,
    pageCount,
  });
  const thumbTopRef = useRef(new Animated.Value(thumbTop));
  const thumbTopSnapshotRef = useRef(thumbTop);
  thumbTopSnapshotRef.current = thumbTop;
  const scrubberMetricsRef = useRef({ trackHeight, thumbHeight, pageCount });
  scrubberMetricsRef.current = { trackHeight, thumbHeight, pageCount };

  useEffect(() => {
    onNavigateToPageRef.current = onNavigateToPage;
  }, [onNavigateToPage]);

  useEffect(() => {
    onPressRef.current = onPress;
    onOpenPageJumpRef.current = onOpenPageJump;
  }, [onOpenPageJump, onPress]);

  useEffect(() => {
    const pendingPage = pendingReleasedScrubPageRef.current;
    if (pendingPage !== null && currentPage === pendingPage) {
      pendingReleasedScrubPageRef.current = null;
      setScrubPreviewPage(null);
    }
  }, [currentPage]);

  useEffect(() => {
    if (!isScrubbingRef.current) {
      thumbTopRef.current.setValue(thumbTop);
    }
  }, [thumbTop, thumbTopRef]);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) {
        clearTimeout(longPressTimerRef.current);
      }
    },
    [],
  );

  if (
    !shouldRenderPageScrubber({
      mobileChromeVisible,
      mobileProgressPillVisible,
      isScrubbing: isScrubbingRef.current,
    })
  ) {
    return null;
  }

  const scrubToPosition = (position: number) => {
    const { trackHeight, thumbHeight, pageCount } = scrubberMetricsRef.current;
    const visualPosition = resolvePageScrubberThumbTopFromPosition({
      position,
      trackHeight,
      thumbHeight,
    });
    thumbTopRef.current.setValue(visualPosition);
    const nextPage = resolvePageScrubberPage({
      position,
      trackHeight,
      thumbHeight,
      pageCount,
    });
    if (nextPage === null) return;
    scrubNavigationControllerRef.current.update(nextPage);
    setScrubPreviewPage(nextPage);
  };

  scrubToPositionRef.current = scrubToPosition;

  if (scrubberResponderRef.current === null) {
    scrubberResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: () => touchPolicy.claimOnStart,
      onStartShouldSetPanResponderCapture: () => touchPolicy.captureOnStart,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => touchPolicy.captureOnMove,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        isScrubbingRef.current = true;
        onScrubbingChangeRef.current?.(true);
        hasMovedRef.current = false;
        longPressTriggeredRef.current = false;
        scrubNavigationControllerRef.current.begin();
        pendingReleasedScrubPageRef.current = null;
        setScrubPreviewPage(currentPageRef.current);
        if (longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
        }
        longPressTimerRef.current = onOpenPageJumpRef.current
          ? setTimeout(() => {
              longPressTimerRef.current = null;
              if (!hasMovedRef.current) {
                longPressTriggeredRef.current = true;
                onOpenPageJumpRef.current?.();
              }
            }, 500)
          : null;
      },
      onPanResponderMove: (_, gestureState) => {
        if (Math.abs(gestureState.dy) <= 4) return;
        hasMovedRef.current = true;
        if (longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        scrubToPositionRef.current(gestureState.moveY - trackYRef.current);
      },
      onPanResponderRelease: () => {
        if (longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        isScrubbingRef.current = false;
        onScrubbingChangeRef.current?.(false);
        const releasedPage = scrubNavigationControllerRef.current.release();
        const releaseAction = resolvePageScrubberReleaseAction({
          hasMoved: hasMovedRef.current,
          pendingPage: releasedPage,
        });
        if (releaseAction.kind === "navigate") {
          pendingReleasedScrubPageRef.current = releaseAction.page;
          if (!onNavigateToPageRef.current) {
            setScrubPreviewPage(null);
          }
        } else {
          scrubNavigationControllerRef.current.cancel();
          pendingReleasedScrubPageRef.current = null;
          setScrubPreviewPage(null);
          if (!longPressTriggeredRef.current) onPressRef.current();
        }
        hasMovedRef.current = false;
        longPressTriggeredRef.current = false;
      },
      onPanResponderTerminate: () => {
        if (longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        isScrubbingRef.current = false;
        onScrubbingChangeRef.current?.(false);
        scrubNavigationControllerRef.current.cancel();
        pendingReleasedScrubPageRef.current = null;
        setScrubPreviewPage(null);
        hasMovedRef.current = false;
        longPressTriggeredRef.current = false;
        thumbTopRef.current.setValue(thumbTopSnapshotRef.current);
      },
    });
  }

  const responderPanHandlers = scrubberResponderRef.current?.panHandlers ?? {};
  const responderTarget: "track" | "pill" = touchPolicy.responderTarget;
  const scrubberPanHandlers =
    responderTarget === "track" ? responderPanHandlers : {};
  const pillPanHandlers =
    responderTarget === "pill" ? responderPanHandlers : {};

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
        {...scrubberPanHandlers}
        onLayout={() => {
          scrubberRef.current?.measureInWindow((_x, y) => {
            trackYRef.current = y;
          });
        }}
      >
        <View style={[styles.track, isDark && styles.trackDark]} />
        <Animated.View style={[styles.thumb, { top: thumbTopRef.current }]}>
          <View
            style={[
              styles.pill,
              isDark && styles.pillDark,
              { borderColor: `${accentColor}33` },
            ]}
            {...pillPanHandlers}
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
          </View>
        </Animated.View>
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
