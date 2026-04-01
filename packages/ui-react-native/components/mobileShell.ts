import { MobilePrimaryDestination } from "@papyrus-sdk/types";

export const isSidebarBoundDestination = (
  destination: MobilePrimaryDestination
) =>
  destination === "pages" ||
  destination === "contents" ||
  destination === "progress" ||
  destination === "notes";
