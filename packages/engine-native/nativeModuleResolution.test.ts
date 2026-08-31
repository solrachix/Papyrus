import { describe, expect, it, vi } from "vitest";

import { resolvePapyrusNativeModule } from "./nativeModuleResolution";

describe("resolvePapyrusNativeModule", () => {
  it("prefers the TurboModule registry", () => {
    const turboModule = { createEngine: vi.fn() };

    expect(
      resolvePapyrusNativeModule({
        nativeModules: { PapyrusNativeEngine: { legacy: true } },
        turboModuleRegistry: { get: vi.fn(() => turboModule) },
      }),
    ).toBe(turboModule);
  });

  it("falls back to the legacy React Native registry", () => {
    const nativeModule = { createEngine: vi.fn() };
    expect(
      resolvePapyrusNativeModule({
        nativeModules: { PapyrusNativeEngine: nativeModule },
        turboModuleRegistry: { get: vi.fn(() => null) },
      }),
    ).toBe(nativeModule);
  });

  it("returns null when neither React Native registry has the module", () => {
    expect(
      resolvePapyrusNativeModule({
        nativeModules: {},
        turboModuleRegistry: { get: vi.fn(() => null) },
      }),
    ).toBeNull();
  });
});
