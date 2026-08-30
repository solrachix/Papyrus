import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  resolve(process.cwd(), "packages/ui-react-native/components/Viewer.tsx"),
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
});
