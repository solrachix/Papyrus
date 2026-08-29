export type ViewerScrollRow = { left: number; right: number | null };

export type ViewerScrollTarget = {
  pageIndex: number;
  listIndex: number;
};

export const resolveViewerScrollTarget = (
  pageIndex: number,
  isDouble: boolean
): ViewerScrollTarget => ({
  pageIndex,
  listIndex: isDouble ? Math.floor(pageIndex / 2) : pageIndex,
});

export const pageContainsScrollTarget = (
  row: ViewerScrollRow,
  pageIndex: number
) => row.left === pageIndex || row.right === pageIndex;
