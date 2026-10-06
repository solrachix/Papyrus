import { describe, expect, it } from "vitest";

import * as nativePdfViewerMode from "./nativePdfViewerMode";
import {
  resolveEffectivePdfViewerMode,
  resolveNativePdfViewerImplementation,
  resolveViewerModeTelemetry,
  shouldUseNativePdfViewer,
} from "./nativePdfViewerMode";

const shouldShowDefineSelection = (
  nativePdfViewerMode as unknown as {
    shouldShowDefineSelection?: (
      text: string | null | undefined,
      mode: "selection" | "single-word"
    ) => boolean;
  }
).shouldShowDefineSelection;

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

  it("falls back to compat for ink only on iOS versions without page overlays", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        activeTool: "ink",
        nativeInkOverlayAvailable: false,
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(false);
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        activeTool: "select",
        nativeInkOverlayAvailable: false,
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(true);
  });

  it("keeps native ink on supported iOS and leaves Android routing unchanged", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        activeTool: "ink",
        nativeInkOverlayAvailable: true,
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(true);
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "android",
        activeTool: "ink",
        nativeInkOverlayAvailable: false,
      })
    ).toBe(true);
  });

  it("falls back to compat for double-page mode on iOS", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        viewMode: "double",
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(false);
  });

  it("falls back to compat when the document has a non-zero rotation on iOS", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "ios",
        rotation: 90,
        nativePdfDocumentViewAvailable: true,
      })
    ).toBe(false);
  });

  it("does not change Android native viewer eligibility for double or rotation", () => {
    expect(
      shouldUseNativePdfViewer({
        ...input,
        platform: "android",
        viewMode: "double",
        rotation: 90,
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

describe("resolveViewerModeTelemetry", () => {
  it("records compat as active when native was requested but fell back", () => {
    expect(
      resolveViewerModeTelemetry({
        requestedMode: "native",
        isNativePdfViewer: false,
        isWebView: false,
      })
    ).toEqual({ mode: "compat", requestedMode: "native" });
  });

  it("records the WebView renderer instead of labeling it compatibility", () => {
    expect(
      resolveViewerModeTelemetry({
        requestedMode: "native",
        isNativePdfViewer: false,
        isWebView: true,
      })
    ).toEqual({ mode: "webview", requestedMode: "native" });
  });

  it("records native when the dedicated native viewer is active", () => {
    expect(
      resolveViewerModeTelemetry({
        requestedMode: "native",
        isNativePdfViewer: true,
        isWebView: false,
      })
    ).toEqual({ mode: "native", requestedMode: "native" });
  });
});

describe("shouldShowDefineSelection", () => {
  it("requires a non-empty single token when single-word mode is active", () => {
    expect(typeof shouldShowDefineSelection).toBe("function");
    expect(shouldShowDefineSelection!("  Tarzan  ", "single-word")).toBe(true);
    expect(shouldShowDefineSelection!("Tarzan Lord", "single-word")).toBe(false);
    expect(shouldShowDefineSelection!("   ", "single-word")).toBe(false);
  });

  it("keeps phrase selections available in the default selection mode", () => {
    expect(typeof shouldShowDefineSelection).toBe("function");
    expect(shouldShowDefineSelection!("Tarzan Lord", "selection")).toBe(true);
    expect(shouldShowDefineSelection!("   ", "selection")).toBe(false);
  });
});
