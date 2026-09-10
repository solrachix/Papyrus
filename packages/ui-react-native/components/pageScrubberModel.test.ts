import { describe, expect, it } from "vitest";

import {
  createPageScrubberNavigationController,
  resolvePageScrubberPage,
  resolvePageScrubberReleaseAction,
  resolvePageScrubberThumbTopFromPosition,
  resolvePageScrubberThumbTop,
  resolvePageScrubberTouchPolicy,
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
  it("captures the gesture before the document and keeps the pill surface passive", () => {
    expect(resolvePageScrubberTouchPolicy()).toEqual({
      responderTarget: "pill",
      claimOnStart: true,
      captureOnStart: true,
      captureOnMove: true,
      childConsumesTouch: false,
    });
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
