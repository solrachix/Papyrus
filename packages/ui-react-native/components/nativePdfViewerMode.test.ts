import { describe, expect, it } from "vitest";

import {
  resolveEffectivePdfViewerMode,
  resolveNativePdfViewerImplementation,
  shouldUseNativePdfViewer,
} from "./nativePdfViewerMode";

const input = {
  viewerMode: "native" as const,
  pageCount: 12,
  isWebView: false,
  nativeEngineId: "native-document",
  pageTheme: "normal",
  nativePdfDocumentViewAvailable: false,
};

describe("shouldUseNativePdfViewer", () => {
  it("keeps the Android native viewer when requested", () => {
    expect(
      shouldUseNativePdfViewer({ ...input, platform: "android" })
    ).toBe(true);
  });

  it("uses the iOS PDFKit viewer only when its native view is registered", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(true);
  });

  it("falls back when the iOS native view manager is missing", () => {
    expect(shouldUseNativePdfViewer({ ...input, platform: "ios" })).toBe(false);
  });

  it("falls back to compat for unsupported iOS page themes", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        pageTheme: "sepia",
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(false);
  });

  it("never uses a native PDF view for a WebView engine", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        isWebView: true,
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(false);
  });

  it("keeps compat mode on the compatibility renderer", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        viewerMode: "compat",
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(false);
  });

  it("waits for a loaded document before mounting a native viewer", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        pageCount: 0,
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(false);
  });
});

describe("resolveNativePdfViewerImplementation", () => {
  it("selects the platform-specific viewer in the wrapper", () => {
    expect(resolveNativePdfViewerImplementation("ios")).toBe("ios");
    expect(resolveNativePdfViewerImplementation("android")).toBe("android");
    expect(resolveNativePdfViewerImplementation("web")).toBeNull();
  });
});

describe("resolveEffectivePdfViewerMode", () => {
  it("honors the explicit native mode on iOS", () => {
    expect(
      resolveEffectivePdfViewerMode({
        platform: "ios",
        viewerMode: "native",
        useDedicatedAndroidPdfViewer: false,
        storeViewerMode: "compat",
      })
    ).toBe("native");
  });

  it("keeps the legacy Android-only flag from opting iOS into native mode", () => {
    expect(
      resolveEffectivePdfViewerMode({
        platform: "ios",
        viewerMode: undefined,
        useDedicatedAndroidPdfViewer: true,
        storeViewerMode: "compat",
      })
    ).toBe("compat");
  });

  it("preserves the legacy native flag on Android", () => {
    expect(
      resolveEffectivePdfViewerMode({
        platform: "android",
        viewerMode: undefined,
        useDedicatedAndroidPdfViewer: true,
        storeViewerMode: "compat",
      })
    ).toBe("native");
  });
});
