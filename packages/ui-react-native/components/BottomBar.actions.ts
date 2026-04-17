import { MobilePrimaryDestination } from "@papyrus-sdk/types";

export function createOpenDestinationHandler(
  onOpenDestination: ((destination: MobilePrimaryDestination) => void) | undefined,
  destination: MobilePrimaryDestination
) {
  return () => {
    onOpenDestination?.(destination);
  };
}