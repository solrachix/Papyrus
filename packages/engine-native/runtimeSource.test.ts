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

  it("keeps Android resource EPUBs as URI payloads", async () => {
    const engine = new WebViewDocumentEngine();
    const uri = "android.resource://com.papyrusmobile/raw/assets_sample";

    await expect(
      (engine as any).normalizeRuntimeSource("epub", {uri}),
    ).resolves.toEqual({kind: "uri", uri});
  });

  it("normalizes data URI objects as in-memory WebView sources", async () => {
    const engine = new WebViewDocumentEngine();

    await expect(
      (engine as any).normalizeRuntimeSource("epub", {
        uri: "data:application/epub+zip;base64,AAE=",
      }),
    ).resolves.toEqual({
      kind: "base64",
      data: "AAE=",
      mime: "application/epub+zip",
    });
  });

  it("keeps Metro asset URIs intact for WebView EPUB loading", async () => {
    const engine = new WebViewDocumentEngine();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const host of [
      "localhost",
      "127.0.0.1",
      "10.0.2.2",
      "192.168.1.50",
    ]) {
      const uri =
        `http://${host}:8093/assets/assets/long-test.epub?platform=android&hash=abc`;
      await expect(
        (engine as any).normalizeRuntimeSource("epub", {uri}),
      ).resolves.toEqual({kind: "uri", uri});
    }

    for (const uri of [
      "https://site.com/book.epub?platform=android&hash=abc",
      "https://site.com/assets/book.epub",
    ]) {
      await expect(
        (engine as any).normalizeRuntimeSource("epub", {uri}),
      ).resolves.toEqual({kind: "uri", uri});
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
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

  it("does not reuse a detached WebView bridge readiness state", async () => {
    const engine = new WebViewDocumentEngine();
    const oldPostMessage = vi.fn();
    const nextPostMessage = vi.fn();

    engine.attachBridge({ postMessage: oldPostMessage });
    engine.handleMessage(JSON.stringify({ type: "ready" }));
    (engine as any).detachBridge();

    const load = engine.load({ type: "text", source: "new document" });
    await Promise.resolve();
    expect(nextPostMessage).not.toHaveBeenCalled();

    engine.attachBridge({ postMessage: nextPostMessage });
    await Promise.resolve();
    expect(nextPostMessage).not.toHaveBeenCalled();

    engine.handleMessage(JSON.stringify({ type: "ready" }));
    await vi.waitFor(() => expect(nextPostMessage).toHaveBeenCalledTimes(1));

    const request = JSON.parse(nextPostMessage.mock.calls[0][0]);
    expect(request).toMatchObject({ kind: "load", payload: { type: "text" } });
    engine.handleMessage(
      JSON.stringify({
        type: "response",
        id: request.id,
        ok: true,
        data: { pageCount: 1 },
      }),
    );
    await load;
    expect(oldPostMessage).not.toHaveBeenCalled();
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
});
