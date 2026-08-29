export type VirtualPageWindow = {
  start: number;
  end: number;
  count: number;
  beforeCount: number;
  afterCount: number;
};

export const resolveVirtualPageWindow = ({
  pageCount,
  anchorIndex,
  overscan,
}: {
  pageCount: number;
  anchorIndex: number;
  overscan: number;
}): VirtualPageWindow => {
  const safePageCount = Math.max(0, Math.floor(pageCount));
  if (safePageCount === 0) {
    return { start: 0, end: -1, count: 0, beforeCount: 0, afterCount: 0 };
  }
  const safeAnchor = Math.max(0, Math.min(safePageCount - 1, Math.floor(anchorIndex)));
  const safeOverscan = Math.max(0, Math.floor(overscan));
  const start = Math.max(0, safeAnchor - safeOverscan);
  const end = Math.min(safePageCount - 1, safeAnchor + safeOverscan);
  return {
    start,
    end,
    count: end - start + 1,
    beforeCount: start,
    afterCount: safePageCount - end - 1,
  };
};
