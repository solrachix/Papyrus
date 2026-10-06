import type { ComicFormat, DocumentType } from "@papyrus-sdk/types";

export type NativeMobileDocumentRoute =
  | "native-pdf"
  | "native-text"
  | "native-comic"
  | "webview";

export type NativeMobileDocumentRouteInput = {
  type: DocumentType;
  format?: ComicFormat;
  platform?: "ios" | "android" | "web" | string;
  nativeModuleAvailable?: boolean;
  nativeViewAvailable?: boolean;
};

export const resolveNativeMobileDocumentRoute = ({
  type,
  platform,
  nativeModuleAvailable = false,
  nativeViewAvailable = false,
}: NativeMobileDocumentRouteInput): NativeMobileDocumentRoute => {
  if (type === "pdf") return "native-pdf";
  if (type === "epub") return "webview";

  const supportedMobilePlatform = platform === "ios" || platform === "android";
  if (
    !supportedMobilePlatform ||
    !nativeModuleAvailable ||
    !nativeViewAvailable
  ) {
    return "webview";
  }

  return type === "text" ? "native-text" : "native-comic";
};
