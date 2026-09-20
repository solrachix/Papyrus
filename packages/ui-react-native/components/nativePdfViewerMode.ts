import type { PdfViewerMode } from "@papyrus-sdk/types";

export type NativePdfViewerModeInput = {
  platform: string;
  viewerMode: PdfViewerMode;
  pageCount: number;
  isWebView: boolean;
  nativeEngineId: string | null;
};

export const shouldUseNativePdfViewer = ({
  platform,
  viewerMode,
  pageCount,
  isWebView,
  nativeEngineId,
}: NativePdfViewerModeInput) =>
  platform === "android" &&
  viewerMode === "native" &&
  pageCount > 0 &&
  !isWebView &&
  !!nativeEngineId;
