import type { DocumentType } from "@papyrus-sdk/types";

type NativeThumbnailSupportInput = {
  renderTarget: string | undefined;
  nativeEngineId: string | null | undefined;
  hasViewManager: boolean;
};

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

export const supportsNativePageThumbnails = ({
  renderTarget,
  nativeEngineId,
  hasViewManager,
}: NativeThumbnailSupportInput): boolean =>
  renderTarget !== "webview" &&
  typeof nativeEngineId === "string" &&
  nativeEngineId.length > 0 &&
  (hasViewManager || renderTarget === "canvas");
