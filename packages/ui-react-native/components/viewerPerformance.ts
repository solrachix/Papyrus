export type ViewerPlatform = "android" | "ios" | "web";

export const resolveOrientationScrollOffset = ({
  currentPage,
  pageCount,
  isDouble,
  getItemOffset,
}: {
  currentPage: number;
  pageCount: number;
  isDouble: boolean;
  getItemOffset: (itemIndex: number) => number;
}): number => {
  if (pageCount <= 0) return 0;
  const pageIndex = Math.max(0, Math.min(pageCount - 1, currentPage - 1));
  const itemIndex = isDouble ? Math.floor(pageIndex / 2) : pageIndex;
  return Math.max(0, getItemOffset(itemIndex));
};

export const resolveRemoveClippedSubviews = ({
  platform,
  viewerMode,
  requestedValue,
}: {
  platform: ViewerPlatform;
  viewerMode: "compat" | "native";
  requestedValue?: boolean;
}): boolean => {
  if (platform === "android" && viewerMode === "compat") {
    return requestedValue ?? false;
  }
  return requestedValue ?? true;
};
