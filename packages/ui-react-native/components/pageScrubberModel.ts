type PageScrubberInput = {
  position: number;
  trackHeight: number;
  thumbHeight: number;
  pageCount: number;
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
