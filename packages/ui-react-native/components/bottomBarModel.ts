import { DocumentType, MobilePrimaryDestination } from "@papyrus-sdk/types";

export type BottomBarSlotKey = "annotate" | "notes" | "search" | "more";

type BottomBarSlot = {
  key: BottomBarSlotKey;
  active: boolean;
};

type BuildBottomBarLayoutInput = {
  documentType: DocumentType;
  activeMobileDestination: MobilePrimaryDestination;
  toolDockOpen: boolean;
};

type BottomBarLayout = {
  leftSlots: BottomBarSlot[];
  rightSlots: BottomBarSlot[];
};

export function buildBottomBarLayout({
  documentType,
  activeMobileDestination,
  toolDockOpen,
}: BuildBottomBarLayoutInput): BottomBarLayout {
  const leftSlots: BottomBarSlot[] = [];

  if (documentType === "pdf") {
    leftSlots.push({
      key: "annotate",
      active: toolDockOpen || activeMobileDestination === "annotate",
    });
  }

  leftSlots.push({
    key: "notes",
    active: activeMobileDestination === "notes",
  });

  return {
    leftSlots,
    rightSlots: [
      {
        key: "search",
        active: activeMobileDestination === "search",
      },
      {
        key: "more",
        active:
          activeMobileDestination === "display" ||
          activeMobileDestination === "documentActions" ||
          activeMobileDestination === "info",
      },
    ],
  };
}
