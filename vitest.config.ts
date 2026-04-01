import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@papyrus-sdk/core": path.resolve(__dirname, "packages/core/index.ts"),
      "@papyrus-sdk/types": path.resolve(__dirname, "packages/types/index.ts"),
      "@papyrus-sdk/ui-react": path.resolve(
        __dirname,
        "packages/ui-react/index.ts"
      ),
      "@papyrus-sdk/engine-pdfjs": path.resolve(
        __dirname,
        "packages/engine-pdfjs/index.ts"
      ),
      "@papyrus-sdk/engine-epub": path.resolve(
        __dirname,
        "packages/engine-epub/index.ts"
      ),
      "@papyrus-sdk/engine-text": path.resolve(
        __dirname,
        "packages/engine-text/index.ts"
      ),
      react: path.resolve(__dirname, "node_modules/react"),
      "react/jsx-runtime": path.resolve(
        __dirname,
        "node_modules/react/jsx-runtime"
      ),
      "react/jsx-dev-runtime": path.resolve(
        __dirname,
        "node_modules/react/jsx-dev-runtime"
      ),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react-dom/client": path.resolve(
        __dirname,
        "node_modules/react-dom/client"
      ),
      "react-dom/test-utils": path.resolve(
        __dirname,
        "node_modules/react-dom/test-utils"
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "examples/web/**/*.test.tsx",
    ],
  },
});
