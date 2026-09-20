import { describe, expect, it } from "vitest";

import { shouldUseNativePdfViewer } from "./nativePdfViewerMode";

describe("shouldUseNativePdfViewer", () => {
  it("keeps iOS on the page renderer because the native PDF view is Android-only", () => {
    expect(
      shouldUseNativePdfViewer({
        platform: "ios",
        viewerMode: "native",
        pageCount: 12,
        isWebView: false,
        nativeEngineId: "native-document",
      })
    ).toBe(false);
  });

  it("uses the native PDF view on Android when explicitly requested", () => {
    expect(
      shouldUseNativePdfViewer({
        platform: "android",
        viewerMode: "native",
        pageCount: 12,
        isWebView: false,
        nativeEngineId: "native-document",
      })
    ).toBe(true);
  });
});
