import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const viewer = read("ui-react-native/components/DedicatedIosPdfViewer.tsx");
const native = read("engine-native/ios/PapyrusPdfDocumentView.m");

describe("native ink chrome integration contract", () => {
  it("removes the old floating action and routes picker visibility through the shared session", () => {
    expect(viewer).not.toContain("papyrus-ios-ink-done");
    expect(viewer).not.toContain("inkDoneButton");
    expect(viewer).toContain("handleNativeInkPickerVisibility");
    expect(viewer).toContain("useViewerStore.getState()");
    expect(viewer).toContain("commitInkStrokesForPage");
  });

  it("keeps the native pending-stroke commit before canvas deactivation", () => {
    const update = native.match(/- \(void\)updateInkCanvasInputAndPicker \{[\s\S]*?\n\}/)?.[0] ?? "";
    const commit = update.indexOf("commitInkDrawingForCanvas:");
    expect(commit).toBeGreaterThanOrEqual(0);
    expect(commit).toBeLessThan(update.indexOf("[self deactivateInkCanvas]"));
  });

  it("uses one finish action for Topbar and BottomBar without a second native save path", () => {
    for (const name of ["Topbar", "BottomBar"]) {
      const source = read(`ui-react-native/components/${name}.tsx`);
      expect(source).toContain("inkSession.finish()");
      expect(source).not.toContain("commitInkDrawing");
    }
  });
});
