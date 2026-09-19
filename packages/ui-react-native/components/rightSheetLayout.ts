import type { DocumentType } from "@papyrus-sdk/types";

type ResolveRightSheetHeightInput = {
  windowHeight: number;
  showingNotes: boolean;
};

export const getRightSheetThumbnailLayout = (sheetWidth: number) => {
  const availableWidth = Number.isFinite(sheetWidth)
    ? Math.max(0, sheetWidth - 32)
    : 0;
  const cardWidth = Math.max(0, (availableWidth - 12) / 2);

  return {
    cardWidth,
    frameWidth: Math.max(0, cardWidth - 16),
  };
};

export const resolveRightSheetHeight = ({
  windowHeight,
  showingNotes,
}: ResolveRightSheetHeightInput) =>
  showingNotes
    ? Math.min(440, windowHeight * 0.56)
    : Math.min(640, windowHeight * 0.72);

export const supportsPageThumbnails = (documentType: DocumentType): boolean =>
  documentType !== "text" && documentType !== "epub";
