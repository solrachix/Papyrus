import type { PdfViewerMode } from "@papyrus-sdk/types";

export type NativePdfViewerModeInput = {
  viewerMode: PdfViewerMode;
  pageCount: number;
  isWebView: boolean;
  nativeEngineId: string | null;
};

export const shouldUseNativePdfViewer = ({
  viewerMode,
  pageCount,
  isWebView,
  nativeEngineId,
}: NativePdfViewerModeInput) =>
  viewerMode === "native" && pageCount > 0 && !isWebView && !!nativeEngineId;
