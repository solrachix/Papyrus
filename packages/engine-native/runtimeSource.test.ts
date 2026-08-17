import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "android" },
  TurboModuleRegistry: { getEnforcing: () => ({}) },
  requireNativeComponent: () => null,
  View: {},
}));
vi.mock("expo-modules-core/src/NativeViewManagerAdapter", () => ({
  requireNativeViewManager: () => null,
}));
vi.mock("expo-modules-core/src/requireNativeModule", () => ({
  requireOptionalNativeModule: () => null,
}));

import { WebViewDocumentEngine } from "./index";

describe("WebViewDocumentEngine local sources", () => {
  it("keeps local comic files as URI payloads", async () => {
    const engine = new WebViewDocumentEngine();

    await expect(
      (engine as any).normalizeRuntimeSource("comic", {
        uri: "file:///data/user/0/com.papyrus/cache/book.cbr",
      }),
    ).resolves.toEqual({
      kind: "uri",
      uri: "file:///data/user/0/com.papyrus/cache/book.cbr",
    });
  });

  it("serves WebView runtime assets through the native bridge", async () => {
    const engine = new WebViewDocumentEngine();
    const postMessage = vi.fn();
    engine.attachBridge({ postMessage });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "worker-source",
    });
    vi.stubGlobal("fetch", fetchMock);

    engine.handleMessage(
      JSON.stringify({
        type: "asset-request",
        id: "asset-1",
        url: "http://10.0.2.2:8081/worker.js",
        encoding: "text",
      }),
    );

    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        JSON.stringify({
          type: "asset-response",
          id: "asset-1",
          ok: true,
          data: "worker-source",
        }),
      );
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://10.0.2.2:8081/worker.js",
    );
    vi.unstubAllGlobals();
  });
});
