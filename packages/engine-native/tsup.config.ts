import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  outDir: "dist",
  external: [
    "expo-modules-core/src/NativeViewManagerAdapter",
    "expo-modules-core/src/requireNativeModule",
    "react-native",
    "@papyrus-sdk/core",
    "@papyrus-sdk/types",
  ],
});
