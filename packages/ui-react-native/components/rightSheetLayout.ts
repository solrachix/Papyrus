import type { DocumentType } from "@papyrus-sdk/types";

type ResolveRightSheetHeightInput = {
  windowHeight: number;
  showingNotes: boolean;
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
