import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  resolve(process.cwd(), "packages/ui-react-native/components/Viewer.tsx"),
  "utf8"
);
const pageRendererSource = readFileSync(
  resolve(
    process.cwd(),
    "packages/ui-react-native/components/PageRenderer.tsx"
  ),
  "utf8"
);
const webViewViewerSource = readFileSync(
  resolve(
    process.cwd(),
    "packages/ui-react-native/components/WebViewViewer.tsx"
  ),
  "utf8"
);
const dedicatedPdfViewerSource = readFileSync(
  resolve(
    process.cwd(),
    "packages/ui-react-native/components/DedicatedAndroidPdfViewer.tsx"
  ),
  "utf8"
);

describe("RN Viewer pinch contract", () => {
  it("uses the incremental Animated preview without Reanimated", () => {
    const pinchSource = viewerSource.slice(
      viewerSource.indexOf("const viewerPinchGesture"),
      viewerSource.indexOf(
        "useEffect(() =>",
        viewerSource.indexOf("const viewerPinchGesture")
      )
    );

    expect(viewerSource).not.toContain('from "react-native-reanimated"');
    expect(viewerSource).not.toContain("useSharedValue");
    expect(pinchSource).toContain(".runOnJS(true)");
    expect(pinchSource).toContain("updateViewerPinch(event.scale");
  });

  it("keeps document side effects out of each pinch update", () => {
    const updateSource = viewerSource.slice(
      viewerSource.indexOf("const updateViewerPinch"),
      viewerSource.indexOf(
        "const cancelViewerPinch",
        viewerSource.indexOf("const updateViewerPinch")
      )
    );

    expect(updateSource).not.toContain("engine.setZoom");
    expect(updateSource).not.toContain("setDocumentState");
    expect(updateSource).not.toContain("renderPage");
    expect(updateSource).not.toContain("renderTextLayer");
  });

  it("keeps the transform surface inside the document content boundary", () => {
    const renderSource = viewerSource.slice(
      viewerSource.indexOf("if (isSingle)")
    );
    expect(renderSource).toContain("styles.gestureSurface");
    expect(renderSource).not.toContain("Topbar");
    expect(renderSource).not.toContain("BottomBar");
    expect(renderSource).not.toContain("ToolDock");
  });

  it("forwards the optional page-width cap to every render surface", () => {
    expect(viewerSource).toContain("maxPageWidth?: number");
    expect(viewerSource).toContain("maxPageWidth={maxPageWidth}");
    expect(viewerSource).toContain(
      "NativePdfDocumentViewer engine={engine} maxPageWidth={maxPageWidth}"
    );
    expect(pageRendererSource).toContain("maxPageWidth,");
    expect(webViewViewerSource).toContain("maxWidth: resolvedMaxPageWidth");
    expect(dedicatedPdfViewerSource).toContain(
      "maxWidth: resolvedMaxPageWidth"
    );
  });

  it("uses the same capped width for list scroll and layout estimates", () => {
    const metricsStart = viewerSource.indexOf(
      "const listLayoutMetrics = useMemo"
    );
    const metricsEnd = viewerSource.indexOf(
      "listLayoutMetricsRef.current = listLayoutMetrics",
      metricsStart
    );
    const metricsSource = viewerSource.slice(metricsStart, metricsEnd);

    expect(metricsSource.match(/maxPageWidth/g) ?? []).toHaveLength(3);
  });

  it("uses the Android-only native PDF surface only on Android", () => {
    expect(viewerSource).toContain("platform: Platform.OS");
    const nativeModeSource = readFileSync(
      resolve(
        process.cwd(),
        "packages/ui-react-native/components/nativePdfViewerMode.ts"
      ),
      "utf8"
    );
    expect(nativeModeSource).toContain('platform === "android"');
  });
});
