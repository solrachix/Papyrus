import { describe, expect, it, vi } from "vitest";
import {
  createOpenDestinationHandler,
  resolveAnnotateButtonAction,
} from "./BottomBar.actions";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

describe("createOpenDestinationHandler", () => {
  it("does not throw when the destination callback is missing", () => {
    const onPress = createOpenDestinationHandler(undefined, "search");

    expect(() => onPress()).not.toThrow();
  });

  it("forwards the selected destination when the callback exists", () => {
    const onOpenDestination = vi.fn();
    const onPress = createOpenDestinationHandler(onOpenDestination, "notes");

    onPress();

    expect(onOpenDestination).toHaveBeenCalledWith("notes");
  });
});

describe("resolveAnnotateButtonAction", () => {
  it("opens the native ink picker directly only for the active iOS native viewer", () => {
    expect(
      resolveAnnotateButtonAction({
        isNativeIosInkViewer: true,
        activeTool: "select",
        toolDockOpen: false,
      })
    ).toBe("activate-native-ink");
  });

  it("preserves the Papyrus dock for compat and Android", () => {
    expect(
      resolveAnnotateButtonAction({
        isNativeIosInkViewer: false,
        activeTool: "select",
        toolDockOpen: false,
      })
    ).toBe("open-tool-dock");
  });

  it("keeps EPUB drawing on the ToolDock path and limits the native picker to PDF", () => {
    const action=resolveAnnotateButtonAction({isNativeIosInkViewer:false,activeTool:"select",toolDockOpen:false});
    const source=readFileSync(resolve(__dirname,"BottomBar.tsx"),"utf8");
    expect(action).toBe("open-tool-dock");
    expect(source).toContain('documentType === "pdf" && inkSession.supported');
    expect(source).not.toContain('documentType === "epub" && inkSession.supported');
  });

  it("mounts the ToolDock in the mobile example for EPUB as well as PDF", () => {
    const appSource = readFileSync(
      resolve(__dirname, "../../../examples/mobile/App.tsx"),
      "utf8"
    );
    expect(appSource).toContain(
      "activeType === 'pdf' || activeType === 'epub' ? <ToolDock /> : null"
    );
  });

  it("toggles native ink off when its drawing control is pressed again", () => {
    expect(
      resolveAnnotateButtonAction({
        isNativeIosInkViewer: true,
        activeTool: "ink",
        toolDockOpen: false,
      })
    ).toBe("deactivate-native-ink");
  });
});
