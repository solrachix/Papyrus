import type { PdfViewerMode } from "@papyrus-sdk/types";

export type NativePdfViewerImplementation = "android" | "ios" | null;
export type ActiveViewerTelemetryMode = "native" | "compat" | "webview";

export const resolveViewerModeTelemetry = ({
  requestedMode,
  isNativePdfViewer,
  isWebView,
}: {
  requestedMode: PdfViewerMode;
  isNativePdfViewer: boolean;
  isWebView: boolean;
}): { mode: ActiveViewerTelemetryMode; requestedMode: PdfViewerMode } => ({
  mode: isNativePdfViewer ? "native" : isWebView ? "webview" : "compat",
  requestedMode,
});

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
  activeTool?: string;
  nativeInkOverlayAvailable?: boolean;
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
  activeTool = "select",
  nativeInkOverlayAvailable = true,
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
  if (activeTool === "ink" && !nativeInkOverlayAvailable) return false;
  return (
    implementation === "ios" &&
    nativePdfDocumentViewAvailable &&
    pageTheme === "normal" &&
    viewMode !== "double" &&
    rotation === 0
  );
};
