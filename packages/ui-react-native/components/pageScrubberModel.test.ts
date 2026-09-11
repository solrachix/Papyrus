import { describe, expect, it } from "vitest";

import {
  createPageScrubberNavigationController,
  isPageScrubberTrackYTrusted,
  resolvePageScrubberGesturePosition,
  resolvePageScrubberPage,
  resolvePageScrubberReleaseAction,
  resolvePageScrubberThumbTopFromPosition,
  resolvePageScrubberThumbTop,
  resolvePageScrubberTouchPolicy,
  resolvePageScrubberOverlayStyle,
  resolvePageScrubberPointerEvents,
  shouldEnableViewerScrollForPageScrub,
  shouldRenderPageScrubber,
} from "./pageScrubberModel";

describe("resolvePageScrubberPage", () => {
  it("maps the top, middle, and bottom of the track to document pages", () => {
    expect(
      resolvePageScrubberPage({ position: 22, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(1);
    expect(
      resolvePageScrubberPage({ position: 150, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(89);
    expect(
      resolvePageScrubberPage({ position: 278, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(177);
  });

  it("clamps invalid positions and empty documents safely", () => {
    expect(
      resolvePageScrubberPage({ position: -100, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(1);
    expect(
      resolvePageScrubberPage({ position: 999, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(177);
    expect(
      resolvePageScrubberPage({ position: 100, trackHeight: 300, thumbHeight: 44, pageCount: 0 })
    ).toBeNull();
  });
});

describe("isPageScrubberTrackYTrusted", () => {
  it("accepts finite in-window origins and rejects off-window sentinel values", () => {
    expect(isPageScrubberTrackYTrusted(0, 914)).toBe(true);
    expect(isPageScrubberTrackYTrusted(914, 914)).toBe(true);
    expect(isPageScrubberTrackYTrusted(-1, 914)).toBe(false);
    expect(isPageScrubberTrackYTrusted(38220.95, 914)).toBe(false);
    expect(isPageScrubberTrackYTrusted(Number.NaN, 914)).toBe(false);
  });
});

describe("resolvePageScrubberGesturePosition", () => {
  it("maps the finger to the track when the measured origin is plausible", () => {
    expect(
      resolvePageScrubberGesturePosition({
        moveY: 260,
        dy: 160,
        trackY: 100,
        windowHeight: 900,
        trackHeight: 300,
        thumbHeight: 44,
        startThumbTop: 0,
      }),
    ).toBe(160);
  });

  it("tracks the thumb relatively when the measured origin is off-window", () => {
    expect(
      resolvePageScrubberGesturePosition({
        moveY: 700,
        dy: 100,
        trackY: 38220.95,
        windowHeight: 914,
        trackHeight: 300,
        thumbHeight: 44,
        startThumbTop: 100,
      }),
    ).toBe(222);
  });

  it("clamps relative thumb tracking to the track bounds", () => {
    expect(
      resolvePageScrubberGesturePosition({
        moveY: 700,
        dy: 9999,
        trackY: Number.NaN,
        windowHeight: 914,
        trackHeight: 300,
        thumbHeight: 44,
        startThumbTop: 0,
      }),
    ).toBe(278);
    expect(
      resolvePageScrubberGesturePosition({
        moveY: 700,
        dy: -9999,
        trackY: 38220.95,
        windowHeight: 914,
        trackHeight: 300,
        thumbHeight: 44,
        startThumbTop: 256,
      }),
    ).toBe(22);
  });
});

describe("resolvePageScrubberThumbTop", () => {
  it("maps the first and last pages to the track bounds", () => {
    expect(
      resolvePageScrubberThumbTop({
        currentPage: 1,
        trackHeight: 300,
        thumbHeight: 44,
        pageCount: 177,
      }),
    ).toBe(0);
    expect(
      resolvePageScrubberThumbTop({
        currentPage: 177,
        trackHeight: 300,
        thumbHeight: 44,
        pageCount: 177,
      }),
    ).toBe(256);
  });
});

describe("resolvePageScrubberThumbTopFromPosition", () => {
  it("keeps the thumb under the finger while clamping to the track", () => {
    expect(
      resolvePageScrubberThumbTopFromPosition({
        position: 50,
        trackHeight: 300,
        thumbHeight: 44,
      }),
    ).toBe(28);
    expect(
      resolvePageScrubberThumbTopFromPosition({
        position: -100,
        trackHeight: 300,
        thumbHeight: 44,
      }),
    ).toBe(0);
    expect(
      resolvePageScrubberThumbTopFromPosition({
        position: 999,
        trackHeight: 300,
        thumbHeight: 44,
      }),
    ).toBe(256);
  });
});

describe("createPageScrubberNavigationController", () => {
  it("navigates only once to the last page after the finger is released", () => {
    const navigatedPages: number[] = [];
    const controller = createPageScrubberNavigationController((page) => {
      navigatedPages.push(page);
    });

    controller.begin();
    controller.update(20);
    controller.update(80);

    expect(navigatedPages).toEqual([]);
    expect(controller.release()).toBe(80);
    expect(navigatedPages).toEqual([80]);
  });
});

describe("shouldRenderPageScrubber", () => {
  it("keeps the scrubber mounted while an active drag hides mobile chrome", () => {
    expect(
      shouldRenderPageScrubber({
        mobileChromeVisible: false,
        mobileProgressPillVisible: true,
        isScrubbing: true,
      }),
    ).toBe(true);
    expect(
      shouldRenderPageScrubber({
        mobileChromeVisible: false,
        mobileProgressPillVisible: true,
        isScrubbing: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderPageScrubber({
        mobileChromeVisible: true,
        mobileProgressPillVisible: false,
        isScrubbing: true,
      }),
    ).toBe(false);
  });
});

describe("resolvePageScrubberReleaseAction", () => {
  it("opens on a tap and navigates only after an actual drag", () => {
    expect(
      resolvePageScrubberReleaseAction({ hasMoved: false, pendingPage: 40 }),
    ).toEqual({ kind: "open" });
    expect(
      resolvePageScrubberReleaseAction({ hasMoved: true, pendingPage: 40 }),
    ).toEqual({ kind: "navigate", page: 40 });
    expect(
      resolvePageScrubberReleaseAction({ hasMoved: true, pendingPage: null }),
    ).toEqual({ kind: "open" });
  });
});

describe("resolvePageScrubberTouchPolicy", () => {
  it("captures the gesture from the full track before the document", () => {
    expect(resolvePageScrubberTouchPolicy()).toEqual({
      responderTarget: "track",
      claimOnStart: true,
      captureOnStart: true,
      captureOnMove: true,
      childConsumesTouch: false,
    });
  });
});

describe("resolvePageScrubberOverlayStyle", () => {
  it("keeps the native overlay above the document surface on Android", () => {
    expect(resolvePageScrubberOverlayStyle()).toEqual({
      zIndex: 30,
      elevation: 30,
    });
  });
});

describe("resolvePageScrubberPointerEvents", () => {
  it("keeps the whole scrubber as the touch target", () => {
    expect(resolvePageScrubberPointerEvents()).toBe("box-only");
  });
});

describe("shouldEnableViewerScrollForPageScrub", () => {
  it("blocks the document while the page pill owns the gesture", () => {
    expect(
      shouldEnableViewerScrollForPageScrub({
        viewerScrollEnabled: true,
        isScrubbing: true,
      }),
    ).toBe(false);
    expect(
      shouldEnableViewerScrollForPageScrub({
        viewerScrollEnabled: true,
        isScrubbing: false,
      }),
    ).toBe(true);
  });
});
