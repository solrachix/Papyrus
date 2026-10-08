import type { useViewerStore } from "@papyrus-sdk/core";

type ViewerState = ReturnType<typeof useViewerStore.getState>;

export function isNativeIosPencilKitViewer(
  platform: string,
  version: string | number,
  nativePdfViewerActive: boolean
): boolean {
  return platform === "ios" && Number.parseInt(String(version), 10) >= 16 && nativePdfViewerActive;
}

export function finishNativeInkSession(
  setDocumentState: ViewerState["setDocumentState"]
) {
  setDocumentState({
    activeTool: "select",
    interactionMode: "pan",
    nativeInkToolPickerActive: false,
    toolDockOpen: false,
    activeMobileDestination: "none",
    mobileChromeVisible: true,
  });
}

export function handleNativeInkPickerVisibility(
  visible: boolean,
  state: Pick<ViewerState, "activeTool" | "nativePdfViewerActive" | "setDocumentState">
) {
  // Native visibility events may arrive after JS has already finished drawing.
  if (visible && (state.activeTool !== "ink" || !state.nativePdfViewerActive)) return;
  if (!visible && state.activeTool === "ink" && state.nativePdfViewerActive) {
    finishNativeInkSession(state.setDocumentState);
    return;
  }
  state.setDocumentState({ nativeInkToolPickerActive: visible });
}
