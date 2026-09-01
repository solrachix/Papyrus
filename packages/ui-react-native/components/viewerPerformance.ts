export type ViewerPlatform = "android" | "ios" | "web";

export const resolveRemoveClippedSubviews = ({
  platform,
  viewerMode,
  requestedValue,
}: {
  platform: ViewerPlatform;
  viewerMode: "compat" | "native";
  requestedValue?: boolean;
}): boolean => {
  if (platform === "android" && viewerMode === "compat") return false;
  return requestedValue ?? true;
};
