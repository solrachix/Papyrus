import { describe, expect, it } from "vitest";
import { resolveNativeMobileDocumentRoute } from "./nativeDocumentRoute";

describe("resolveNativeMobileDocumentRoute", () => {
  it("keeps PDF on the existing native PDF path", () => {
    expect(
      resolveNativeMobileDocumentRoute({ type: "pdf", nativeModuleAvailable: true }),
    ).toBe("native-pdf");
  });

  it("keeps EPUB on the existing WebView path", () => {
    expect(
      resolveNativeMobileDocumentRoute({ type: "epub", nativeModuleAvailable: true }),
    ).toBe("webview");
  });

  it.each(["ios", "android"] as const)(
    "routes TXT through the native view on %s when its bridge exists",
    (platform) => {
      expect(
        resolveNativeMobileDocumentRoute({
          type: "text",
          platform,
          nativeModuleAvailable: true,
          nativeViewAvailable: true,
        }),
      ).toBe("native-text");
    },
  );

  it.each(["cbz", "cbr"] as const)(
    "routes %s through the common native comic path",
    (format) => {
      expect(
        resolveNativeMobileDocumentRoute({
          type: "comic",
          format,
          platform: "android",
          nativeModuleAvailable: true,
          nativeViewAvailable: true,
        }),
      ).toBe("native-comic");
    },
  );

  it("uses the existing compatibility route when the native view is absent", () => {
    expect(
      resolveNativeMobileDocumentRoute({
        type: "text",
        platform: "ios",
        nativeModuleAvailable: true,
        nativeViewAvailable: false,
      }),
    ).toBe("webview");
  });
});
