import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("guards native bitmap promotion by generation and keeps OOM explicit", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java",
      ),
      "utf8",
    );
    const renderStart = source.indexOf("private void requestRender(PageFrame frame");
    const staleGuard = source.indexOf(
      "if (generationAtStart != renderGeneration)",
      renderStart,
    );
    const cachePromotion = source.indexOf(
      "RENDER_CACHE.put(key, finalRendered)",
      staleGuard,
    );

    expect(renderStart).toBeGreaterThanOrEqual(0);
    expect(staleGuard).toBeGreaterThan(renderStart);
    expect(cachePromotion).toBeGreaterThan(staleGuard);
    expect(source).toContain("catch (OutOfMemoryError error)");
  });

  it("reapplies the requested page after the native view receives its size", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusPdfViewerView.java",
      ),
      "utf8",
    );

    expect(source).toContain("private int pendingCurrentPage = 1;");
    expect(source).toContain("pendingCurrentPage = page;");
    expect(source).toContain("setCurrentPage(pendingCurrentPage);");
  });
});
