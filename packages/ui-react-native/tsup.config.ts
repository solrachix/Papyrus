import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "index.ts",
    "gesture/pinchZoom.ts",
    "gesture/selectionInteraction.ts",
  ],
  external: ["react-native-gesture-handler", "react-native-reanimated"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: "dist",
  target: "es2022",
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      ".html": "text",
    };
  },
});
