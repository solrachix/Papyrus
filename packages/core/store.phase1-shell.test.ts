import { beforeEach, describe, expect, it } from "vitest";
import { useViewerStore } from "./store";

describe("phase-1 shell state", () => {
  beforeEach(() => {
    useViewerStore.setState(useViewerStore.getInitialState(), true);
  });

  it("opens search as the only active primary surface", () => {
    const store = useViewerStore.getState();
    store.openActiveSurface("search");

    expect(useViewerStore.getState().activeSurface).toBe("search");
    expect(useViewerStore.getState().readingMode).toBe("modalSurfaceOpen");
  });

  it("restores controlsVisible when the active surface closes", () => {
    const store = useViewerStore.getState();
    store.openActiveSurface("info");
    store.closeActiveSurface();

    expect(useViewerStore.getState().readingMode).toBe("controlsVisible");
    expect(useViewerStore.getState().activeSurface).toBe("none");
  });

  it("opens a mobile destination and keeps dock plus progress pill visible by default", () => {
    const store = useViewerStore.getState();

    store.openMobileDestination("pages");

    expect(useViewerStore.getState().activeMobileDestination).toBe("pages");
    expect(useViewerStore.getState().mobileDockVisible).toBe(true);
    expect(useViewerStore.getState().mobileProgressPillVisible).toBe(true);
  });

  it("hides the dock when the keyboard opens over the search destination", () => {
    const store = useViewerStore.getState();

    store.openMobileDestination("search");
    store.setMobileKeyboardOpen(true);

    expect(useViewerStore.getState().activeMobileDestination).toBe("search");
    expect(useViewerStore.getState().mobileKeyboardOpen).toBe(true);
    expect(useViewerStore.getState().mobileDockVisible).toBe(false);
    expect(useViewerStore.getState().mobileProgressPillVisible).toBe(false);
  });

  it("restores dock and progress pill when the search overlay closes", () => {
    const store = useViewerStore.getState();

    store.openMobileDestination("search");
    store.setMobileKeyboardOpen(true);
    store.closeMobileDestination();
    store.setMobileKeyboardOpen(false);

    expect(useViewerStore.getState().activeMobileDestination).toBe("none");
    expect(useViewerStore.getState().mobileDockVisible).toBe(true);
    expect(useViewerStore.getState().mobileProgressPillVisible).toBe(true);
  });

  it("defaults pdf viewing to compat mode", () => {
    expect(useViewerStore.getState().viewerMode).toBe("compat");
    expect(useViewerStore.getState().visiblePages).toEqual([]);
    expect(useViewerStore.getState().nativeViewportGestureActive).toBe(false);
  });

  it("initializes native pdf viewer mode from config", () => {
    const store = useViewerStore.getState();

    store.initializeStore({ viewerMode: "native" });

    expect(useViewerStore.getState().viewerMode).toBe("native");
  });

  it("stores visible native pages without changing the current page", () => {
    const store = useViewerStore.getState();

    store.setDocumentState({
      currentPage: 3,
      visiblePages: [{ pageIndex: 2, visibleRatio: 0.75 }],
    });
    store.setDocumentState({
      visiblePages: [{ pageIndex: 4, visibleRatio: 0.5 }],
    });

    expect(useViewerStore.getState().currentPage).toBe(3);
    expect(useViewerStore.getState().visiblePages).toEqual([
      { pageIndex: 4, visibleRatio: 0.5 },
    ]);
  });
});
