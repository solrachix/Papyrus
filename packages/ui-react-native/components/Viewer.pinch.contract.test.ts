import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync(
  resolve(process.cwd(), "packages/ui-react-native/components/Viewer.tsx"),
  "utf8"
);

describe("RN Viewer pinch contract", () => {
  it("does not route pinch updates through the JS thread", () => {
    const pinchSource = viewerSource.slice(
      viewerSource.indexOf("const viewerPinchGesture"),
      viewerSource.indexOf(
        "useEffect(() =>",
        viewerSource.indexOf("const viewerPinchGesture")
      )
    );

    expect(pinchSource).not.toContain(".runOnJS(true)");
    expect(viewerSource).toContain("useAnimatedStyle");
    expect(pinchSource).not.toContain("updateViewerPinch(event.scale");
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
