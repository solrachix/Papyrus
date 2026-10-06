import { MobilePrimaryDestination } from "@papyrus-sdk/types";

export function createOpenDestinationHandler(
  onOpenDestination: ((destination: MobilePrimaryDestination) => void) | undefined,
  destination: MobilePrimaryDestination
) {
  return () => {
    onOpenDestination?.(destination);
  };
}

export type AnnotateButtonAction =
  | "activate-native-ink"
  | "deactivate-native-ink"
  | "open-tool-dock"
  | "dismiss-tool-dock";

export function resolveAnnotateButtonAction(input: {
  isNativeIosInkViewer: boolean;
  activeTool: string;
  toolDockOpen: boolean;
}): AnnotateButtonAction {
  if (input.isNativeIosInkViewer) {
    return input.activeTool === "ink"
      ? "deactivate-native-ink"
      : "activate-native-ink";
  }
  return input.toolDockOpen ? "dismiss-tool-dock" : "open-tool-dock";
}
