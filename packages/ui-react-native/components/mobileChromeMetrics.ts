export const MOBILE_CHROME_METRICS = {
  screenPadding: 16,
  maxFloatingWidth: 360,
  maxToolDockWidth: 420,
  toolDockPaddingTop: 4,
  toolDockHistoryIconSize: 18,
  toolDockHistoryGap: 2,
  toolDockDisabledIconColorDark: "#64748b",
  toolDockDisabledIconColorLight: "#6b7280",
  toolDockDisabledOpacity: 0.72,
  iconSize: 20,
  iconBoxSize: 28,
  topbarPageButtonSize: 30,
  bottomBarItemPaddingHorizontal: 5,
  bottomBarItemPaddingVertical: 3,
  topbarHeight: 56,
  progressGap: 10,
} as const;

export type MobileSafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export const resolveMobileChromeOffsets = (
  insets: MobileSafeAreaInsets
) => ({
  topbar: Math.max(0, insets.top),
  progress:
    Math.max(0, insets.top) +
    MOBILE_CHROME_METRICS.topbarHeight +
    MOBILE_CHROME_METRICS.progressGap,
  bottom: Math.max(0, insets.bottom) + 14,
  search: Math.max(0, insets.bottom) + 20,
  left: MOBILE_CHROME_METRICS.screenPadding + Math.max(0, insets.left),
  right: MOBILE_CHROME_METRICS.screenPadding + Math.max(0, insets.right),
});
