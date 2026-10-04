import type { PdfViewerMode } from "@papyrus-sdk/types";

export type NativePdfViewerImplementation = "android" | "ios" | null;

export const resolveNativePdfViewerImplementation = (
  platform: string
): NativePdfViewerImplementation => {
  if (platform === "android") return "android";
  if (platform === "ios") return "ios";
  return null;
};

export const resolveEffectivePdfViewerMode = ({
  platform,
  viewerMode,
  useDedicatedAndroidPdfViewer,
  storeViewerMode,
}: {
  platform: string;
  viewerMode: PdfViewerMode | undefined;
  useDedicatedAndroidPdfViewer: boolean | undefined;
  storeViewerMode: PdfViewerMode;
}): PdfViewerMode =>
  viewerMode ??
  (platform === "android" && useDedicatedAndroidPdfViewer
    ? "native"
    : storeViewerMode);

export type NativePdfViewerModeInput = {
  platform: string;
  viewerMode: PdfViewerMode;
  pageCount: number;
  isWebView: boolean;
  nativeEngineId: string | null;
  nativePdfDocumentViewAvailable?: boolean;
  pageTheme?: string;
  viewMode?: "single" | "double" | "continuous";
  rotation?: number;
};

export const shouldUseNativePdfViewer = ({
  platform,
  viewerMode,
  pageCount,
  isWebView,
  nativeEngineId,
  nativePdfDocumentViewAvailable = false,
  pageTheme = "normal",
  viewMode = "continuous",
  rotation = 0,
}: NativePdfViewerModeInput): boolean => {
  if (
    viewerMode !== "native" ||
    pageCount <= 0 ||
    isWebView ||
    !nativeEngineId
  ) {
    return false;
  }

  const implementation = resolveNativePdfViewerImplementation(platform);
  if (implementation === "android") return true;
  return (
    implementation === "ios" &&
    nativePdfDocumentViewAvailable &&
    pageTheme === "normal" &&
    viewMode !== "double" &&
    rotation === 0
  );
};
