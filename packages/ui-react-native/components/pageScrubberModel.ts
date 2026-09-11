type PageScrubberInput = {
  position: number;
  trackHeight: number;
  thumbHeight: number;
  pageCount: number;
};

type PageScrubberVisibilityInput = {
  mobileChromeVisible: boolean;
  mobileProgressPillVisible: boolean;
  isScrubbing: boolean;
};

export const shouldRenderPageScrubber = ({
  mobileChromeVisible,
  mobileProgressPillVisible,
  isScrubbing,
}: PageScrubberVisibilityInput): boolean =>
  mobileProgressPillVisible && (mobileChromeVisible || isScrubbing);

export const shouldEnableViewerScrollForPageScrub = ({
  viewerScrollEnabled,
  isScrubbing,
}: {
  viewerScrollEnabled: boolean;
  isScrubbing: boolean;
}): boolean => viewerScrollEnabled && !isScrubbing;

export type PageScrubberTouchPolicy = {
  responderTarget: "track" | "pill";
  claimOnStart: boolean;
  captureOnStart: boolean;
  captureOnMove: boolean;
  childConsumesTouch: boolean;
};

export const resolvePageScrubberTouchPolicy = (): PageScrubberTouchPolicy => ({
  responderTarget: "track",
  claimOnStart: true,
  captureOnStart: true,
  captureOnMove: true,
  childConsumesTouch: false,
});

export const resolvePageScrubberOverlayStyle = () => ({
  zIndex: 30,
  elevation: 30,
});

export const resolvePageScrubberPointerEvents = () => "box-only" as const;

type PageScrubberThumbTopInput = {
  currentPage: number;
  trackHeight: number;
  thumbHeight: number;
  pageCount: number;
};

type PageScrubberThumbPositionInput = {
  position: number;
  trackHeight: number;
  thumbHeight: number;
};

type PageScrubberNavigationController = {
  begin: () => void;
  update: (page: number | null) => void;
  release: () => number | null;
  cancel: () => void;
};

type PageScrubberReleaseAction =
  | { kind: "open" }
  | { kind: "navigate"; page: number };

export const resolvePageScrubberReleaseAction = ({
  hasMoved,
  pendingPage,
}: {
  hasMoved: boolean;
  pendingPage: number | null;
}): PageScrubberReleaseAction =>
  hasMoved && pendingPage !== null
    ? { kind: "navigate", page: pendingPage }
    : { kind: "open" };

export const createPageScrubberNavigationController = (
  onRelease: (page: number) => void,
): PageScrubberNavigationController => {
  let active = false;
  let pendingPage: number | null = null;

  return {
    begin: () => {
      active = true;
      pendingPage = null;
    },
    update: (page) => {
      if (active) pendingPage = page;
    },
    release: () => {
      active = false;
      const page = pendingPage;
      pendingPage = null;
      if (page !== null) onRelease(page);
      return page;
    },
    cancel: () => {
      active = false;
      pendingPage = null;
    },
  };
};

export const resolvePageScrubberThumbTopFromPosition = ({
  position,
  trackHeight,
  thumbHeight,
}: PageScrubberThumbPositionInput): number =>
  Math.max(0, Math.min(trackHeight - thumbHeight, position - thumbHeight / 2));

export const resolvePageScrubberThumbTop = ({
  currentPage,
  trackHeight,
  thumbHeight,
  pageCount,
}: PageScrubberThumbTopInput): number => {
  if (pageCount <= 1) return 0;
  const travel = Math.max(0, trackHeight - thumbHeight);
  const ratio = Math.max(
    0,
    Math.min(1, (currentPage - 1) / Math.max(1, pageCount - 1)),
  );
  return ratio * travel;
};

export const resolvePageScrubberPage = ({
  position,
  trackHeight,
  thumbHeight,
  pageCount,
}: PageScrubberInput): number | null => {
  if (!Number.isFinite(pageCount) || pageCount <= 0) return null;
  if (pageCount === 1) return 1;

  const travel = Math.max(0, trackHeight - thumbHeight);
  const thumbTop = Math.max(0, Math.min(travel, position - thumbHeight / 2));
  const ratio = travel === 0 ? 0 : thumbTop / travel;
  return Math.max(
    1,
    Math.min(pageCount, Math.round(ratio * (pageCount - 1)) + 1)
  );
};

export const isPageScrubberTrackYTrusted = (
  trackY: number,
  windowHeight: number,
): boolean =>
  Number.isFinite(trackY) &&
  Number.isFinite(windowHeight) &&
  trackY >= 0 &&
  trackY <= windowHeight;

type PageScrubberGesturePositionInput = {
  moveY: number;
  dy: number;
  trackY: number;
  windowHeight: number;
  trackHeight: number;
  thumbHeight: number;
  startThumbTop: number;
};

export const resolvePageScrubberGesturePosition = ({
  moveY,
  dy,
  trackY,
  windowHeight,
  trackHeight,
  thumbHeight,
  startThumbTop,
}: PageScrubberGesturePositionInput): number => {
  if (isPageScrubberTrackYTrusted(trackY, windowHeight)) {
    return moveY - trackY;
  }

  const travel = Math.max(0, trackHeight - thumbHeight);
  const nextThumbTop = Math.max(0, Math.min(travel, startThumbTop + dy));
  return nextThumbTop + thumbHeight / 2;
};
