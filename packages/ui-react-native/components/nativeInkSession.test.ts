import { describe, expect, it, vi } from "vitest";
import { useViewerStore } from "@papyrus-sdk/core";
import {
  finishNativeInkSession,
  handleNativeInkPickerVisibility,
  isNativeIosPencilKitViewer,
} from "./nativeInkSession";

describe("native PencilKit session", () => {
  it.each([
    ["ios", 16, true, true],
    ["ios", "18.5", true, true],
    ["ios", 15, true, false],
    ["android", 35, true, false],
    ["ios", 18, false, false],
    ["ios", "invalid", true, false],
  ])("scope %s/%s/native=%s", (platform, version, native, expected) => {
    expect(isNativeIosPencilKitViewer(platform, version, native)).toBe(expected);
  });

  it("finishes through the store and preserves viewport and annotations", () => {
    const before = useViewerStore.getState();
    useViewerStore.setState({activeTool: "ink", nativePdfViewerActive: true,
      nativeInkToolPickerActive: true, mobileChromeVisible: false,
      toolDockOpen: true, activeMobileDestination: "annotate", currentPage: 8, zoom: 2});
    const annotations = useViewerStore.getState().annotations;
    finishNativeInkSession(useViewerStore.getState().setDocumentState);
    expect(useViewerStore.getState()).toMatchObject({activeTool: "select",
      interactionMode: "pan", nativeInkToolPickerActive: false, toolDockOpen: false,
      activeMobileDestination: "none", mobileChromeVisible: true, currentPage: 8, zoom: 2});
    expect(useViewerStore.getState().annotations).toBe(annotations);
    useViewerStore.setState(before, true);
  });

  it("native picker dismissal uses the same completion state", () => {
    const setDocumentState = vi.fn();
    const state = {...useViewerStore.getState(), activeTool: "ink", nativePdfViewerActive: true, setDocumentState};
    handleNativeInkPickerVisibility(false, state);
    const direct = vi.fn();
    finishNativeInkSession(direct);
    expect(setDocumentState.mock.calls).toEqual(direct.mock.calls);
  });

  it("late picker visibility cannot reactivate a finished session", () => {
    const setDocumentState = vi.fn();
    const state = {...useViewerStore.getState(), activeTool: "select", nativePdfViewerActive: true, setDocumentState};
    handleNativeInkPickerVisibility(true, state);
    expect(setDocumentState).not.toHaveBeenCalled();
  });

  it("rapid finish and activation preserve the latest store intent", () => {
    const before = useViewerStore.getState();
    for (let i = 0; i < 4; i += 1) {
      useViewerStore.setState({activeTool: "ink", nativePdfViewerActive: true});
      finishNativeInkSession(useViewerStore.getState().setDocumentState);
      handleNativeInkPickerVisibility(true, useViewerStore.getState());
      expect(useViewerStore.getState().activeTool).toBe("select");
      expect(useViewerStore.getState().nativeInkToolPickerActive).toBe(false);
    }
    useViewerStore.setState(before, true);
  });
});
