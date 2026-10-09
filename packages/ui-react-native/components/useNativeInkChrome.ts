import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { finishNativeInkSession, isNativeIosPencilKitViewer } from "./nativeInkSession";

export function useNativeInkSession() {
  const nativePdfViewerActive = useViewerStore((state) => state.nativePdfViewerActive);
  const activeTool = useViewerStore((state) => state.activeTool);
  const supported = isNativeIosPencilKitViewer(Platform.OS, Platform.Version, nativePdfViewerActive);
  const finish = useCallback(() => {
    finishNativeInkSession(useViewerStore.getState().setDocumentState);
  }, []);
  return { supported, active: supported && activeTool === "ink", finish };
}

export function useNativeInkMotion(visible: boolean, enabled: boolean) {
  const systemReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(systemReducedMotion);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    let mounted = true;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReducedMotion(value);
    });
    return () => { mounted = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    // Reassigning the same shared value cancels the previous transition and
    // continues from its current presentation, without completion timers.
    progress.value = enabled ? withTiming(visible ? 1 : 0, {
      duration: reducedMotion ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      reduceMotion: ReduceMotion.System,
    }) : (visible ? 1 : 0);
  }, [enabled, progress, reducedMotion, visible]);

  useEffect(() => () => cancelAnimation(progress), [progress]);
  return progress;
}
