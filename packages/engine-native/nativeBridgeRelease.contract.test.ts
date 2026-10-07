import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ios = read("packages/engine-native/ios/PapyrusNativeEngine.m");
const android = read(
  "packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java"
);
const podspec = read("packages/engine-native/ios/PapyrusNativeEngine.podspec");

describe("native release bridge contracts", () => {
  it("accepts all eight JS renderPage arguments on iOS", () => {
    const signature = ios.match(/RCT_EXPORT_METHOD\(renderPage:([\s\S]*?)\)\s*\{/);
    expect(signature).not.toBeNull();
    const selectors = signature![0].match(/\w+:(?=\()/g);
    expect(selectors).toEqual([
      "renderPage:", "pageIndex:", "target:", "scale:", "zoom:",
      "rotation:", "requestId:", "telemetryContext:",
    ]);
  });

  it("uses a bridge-supported map for Android page destinations", () => {
    const signature = android.match(/public void getPageIndex\(([^)]*)\)/);
    expect(signature?.[1]).toBe("String engineId, ReadableMap dest, Promise promise");
  });

  it("copies the archive error before crossing into the main queue block", () => {
    const start = ios.indexOf("void (^openPath)");
    const openPath = ios.slice(start, ios.indexOf('NSString *uri = source', start));
    const mainQueueBlock = openPath.indexOf("dispatch_async(dispatch_get_main_queue()");
    const messageCopy = openPath.indexOf("NSString *reason = message[0]");
    expect(messageCopy).toBeGreaterThanOrEqual(0);
    expect(messageCopy).toBeLessThan(mainQueueBlock);
    expect(openPath.slice(mainQueueBlock)).not.toMatch(/\bmessage\b/);
  });

  it("compiles the filesystem-based archive wrapper as C++17 on iOS", () => {
    expect(podspec).toMatch(/'CLANG_CXX_LANGUAGE_STANDARD'\s*=>\s*'c\+\+17'/);
  });

  it("reads the pod version from the npm package instead of a stale literal", () => {
    expect(podspec).toContain("require 'json'");
    expect(podspec).toContain("File.join(__dir__, '..', 'package.json')");
    expect(podspec).toMatch(/s\.version\s*=\s*package\['version'\]/);
  });
});
