import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { DocumentType } from "@papyrus-sdk/types";
import { getStrings } from "../mobileStrings";
import { resolveProgressPillMode } from "./progressPillMode";
import { IconPageNav } from "../icons";
import { resolveMobileChromeOffsets } from "./mobileChromeMetrics";
import { usePapyrusSafeAreaInsets } from "./PapyrusSafeArea";
import {
  createPageScrubberNavigationController,
  resolvePageScrubberGesturePosition,
  resolvePageScrubberOverlayStyle,
  resolvePageScrubberPage,
  resolvePageScrubberPointerEvents,
  resolvePageScrubberReleaseAction,
  resolvePageScrubberTouchPolicy,
  resolvePageScrubberThumbTop,
  resolvePageScrubberThumbTopFromPosition,
  resolvePageScrubberTrackHeight,
  resolvePageScrubberTrackRevealOrigin,
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
    currentTextOffset,
    textLength,
    comicLayoutMode,
    viewMode,
    locale,
    uiTheme,
    accentColor,
    mobileChromeVisible,
    mobileProgressPillVisible,
  } = useViewerStore();
  const t = getStrings(locale);
  const isDark = uiTheme === "dark";
  const offsets = resolveMobileChromeOffsets(usePapyrusSafeAreaInsets());
  const { height: windowHeight } = useWindowDimensions();
  const windowHeightRef = useRef(windowHeight);
  windowHeightRef.current = windowHeight;
  const trackHeight = resolvePageScrubberTrackHeight({
    windowHeight,
    topOffset: offsets.progress,
    bottomOffset: offsets.bottom,
  });
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
  const scrubStartThumbTopRef = useRef(0);
  const trackReveal = useRef(new Animated.Value(0)).current;
  const [trackOriginY, setTrackOriginY] = useState(0);
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

  if (documentType === "text") {
    const progress = textLength <= 0
      ? 0
      : clampPercent((currentTextOffset / textLength) * 100);
    return (
      <View
        pointerEvents="box-none"
        style={[styles.frame, styles.singleFrame, { top: offsets.progress, right: offsets.right }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t.progress} ${progress}%`}
          onPress={() => onPressRef.current()}
          style={[styles.singlePill, isDark && styles.pillDark]}
          testID="papyrus-progress-text"
        >
          <Text style={[styles.label, isDark && styles.labelDark]}>{progress}%</Text>
        </Pressable>
      </View>
    );
  }

  const progressViewMode = documentType === "comic"
    ? comicLayoutMode === "single" ? "single" : "continuous"
    : viewMode;
  const pillMode = resolveProgressPillMode(progressViewMode, currentPage, pageCount);
  if (pillMode.kind === "navigation") {
    const previousDisabled = pillMode.previousPage === null || !onNavigateToPage;
    const nextDisabled = pillMode.nextPage === null || !onNavigateToPage;
    return (
      <View
        pointerEvents="box-none"
        style={[styles.frame, styles.singleFrame, { top: offsets.progress, right: offsets.right }]}
      >
        <View style={[styles.singlePill, isDark && styles.pillDark]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.previousPage}
            accessibilityState={{ disabled: previousDisabled }}
            disabled={previousDisabled}
            onPress={() => pillMode.previousPage !== null && onNavigateToPageRef.current?.(pillMode.previousPage)}
            style={styles.pageArrowHit}
            testID="papyrus-progress-page-previous"
          >
            <Text style={[styles.pageArrow, isDark && styles.labelDark, previousDisabled && styles.pageArrowDisabled]}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${currentPage}/${pageCount || 0}`}
            onPress={() => onPressRef.current()}
            style={styles.singlePageCenter}
            testID="papyrus-progress-page-grid"
          >
            <Text style={[styles.label, isDark && styles.labelDark]}>{currentPage}/{pageCount || 0}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.nextPage}
            accessibilityState={{ disabled: nextDisabled }}
            disabled={nextDisabled}
            onPress={() => pillMode.nextPage !== null && onNavigateToPageRef.current?.(pillMode.nextPage)}
            style={styles.pageArrowHit}
            testID="papyrus-progress-page-next"
          >
            <Text style={[styles.pageArrow, isDark && styles.labelDark, nextDisabled && styles.pageArrowDisabled]}>›</Text>
          </Pressable>
        </View>
      </View>
    );
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
        scrubStartThumbTopRef.current = thumbTopSnapshotRef.current;
        setTrackOriginY(
          resolvePageScrubberTrackRevealOrigin({
            thumbTop: thumbTopSnapshotRef.current,
            thumbHeight,
            trackHeight: scrubberMetricsRef.current.trackHeight,
          }),
        );
        trackReveal.setValue(0);
        Animated.timing(trackReveal, {
          toValue: 1,
          duration: 180,
          useNativeDriver: false,
        }).start();
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
        const { trackHeight, thumbHeight } = scrubberMetricsRef.current;
        scrubToPositionRef.current(
          resolvePageScrubberGesturePosition({
            moveY: gestureState.moveY,
            dy: gestureState.dy,
            trackY: trackYRef.current,
            windowHeight: windowHeightRef.current,
            trackHeight,
            thumbHeight,
            startThumbTop: scrubStartThumbTopRef.current,
          }),
        );
      },
      onPanResponderRelease: () => {
        if (longPressTimerRef.current !== null) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        isScrubbingRef.current = false;
        onScrubbingChangeRef.current?.(false);
        Animated.timing(trackReveal, {
          toValue: 0,
          duration: 140,
          useNativeDriver: false,
        }).start();
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
        Animated.timing(trackReveal, {
          toValue: 0,
          duration: 140,
          useNativeDriver: false,
        }).start();
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
        resolvePageScrubberOverlayStyle(),
        {
          top: offsets.progress,
          right: offsets.right,
        },
      ]}
    >
      <View
        ref={scrubberRef}
        pointerEvents={resolvePageScrubberPointerEvents()}
        style={[styles.scrubber, { height: trackHeight }]}
        {...scrubberPanHandlers}
        onLayout={() => {
          scrubberRef.current?.measureInWindow((_x, y) => {
            trackYRef.current = y;
          });
        }}
      >
        <Animated.View
          style={[
            styles.track,
            isDark && styles.trackDark,
            {
              transformOrigin: [0, trackOriginY, 0],
              opacity: trackReveal,
              transform: [{ scaleY: trackReveal }],
              elevation: 6,
            },
          ]}
        />
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
  singleFrame: {
    bottom: "auto",
  },
  singlePill: {
    minWidth: 150,
    minHeight: 44,
    marginRight: 4,
    paddingHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    backgroundColor: "rgba(255,255,255,0.9)",
    elevation: 6,
  },
  pageArrowHit: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  pageArrow: {
    fontSize: 28,
    lineHeight: 32,
    color: "#111827",
  },
  pageArrowDisabled: {
    opacity: 0.28,
  },
  singlePageCenter: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    position: "absolute",
    top: 0,
    right: 0,
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
