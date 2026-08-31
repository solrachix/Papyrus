import path from "node:path";
import { describe, expect, it } from "vitest";

import metroConfig from "../../../examples/mobile/metro.config.js";

describe("mobile Metro resolution", () => {
  it("resolves React Native internals from the installed React Native package", () => {
    const reactNativeRoot = path.dirname(
      require.resolve("react-native/package.json")
    );

    expect(metroConfig.resolver.nodeModulesPaths).toContain(
      path.dirname(reactNativeRoot)
    );
  });
});
