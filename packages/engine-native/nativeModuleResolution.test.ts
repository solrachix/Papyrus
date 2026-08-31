import { describe, expect, it, vi } from "vitest";

import { resolvePapyrusNativeModule } from "./nativeModuleResolution";

describe("resolvePapyrusNativeModule", () => {
  it("uses the React Native registry without requiring Expo modules", () => {
    const nativeModule = { createEngine: vi.fn() };
    expect(
      resolvePapyrusNativeModule({
        nativeModules: { PapyrusNativeEngine: nativeModule },
        turboModuleRegistry: { get: vi.fn(() => null) },
      }),
    ).toBe(nativeModule);
  });
});
