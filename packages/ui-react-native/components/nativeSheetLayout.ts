const FLOATING_SHEET_MIN_WINDOW_WIDTH = 600;
const FLOATING_SHEET_HORIZONTAL_GUTTER = 32;
const FLOATING_SHEET_MAX_WIDTH = 640;

export const getNativeSheetSizeStyle = (maxHeight?: number | string) => {
  if (!maxHeight) return null;
  return {
    maxHeight,
    ...(typeof maxHeight === "number" ? { height: maxHeight } : {}),
  };
};

export const getNativeSheetWidth = (windowWidth: number) => {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) return 0;
  if (windowWidth < FLOATING_SHEET_MIN_WINDOW_WIDTH) return windowWidth;

  return Math.min(
    FLOATING_SHEET_MAX_WIDTH,
    windowWidth - FLOATING_SHEET_HORIZONTAL_GUTTER * 2,
  );
};

export const getNativeSheetLayoutStyles = (windowWidth: number) => {
  if (
    !Number.isFinite(windowWidth) ||
    windowWidth < FLOATING_SHEET_MIN_WINDOW_WIDTH
  ) {
    return null;
  }

  return {
    root: {
      justifyContent: "center",
      paddingHorizontal: FLOATING_SHEET_HORIZONTAL_GUTTER,
      paddingVertical: 24,
    } as const,
    sheet: {
      width: getNativeSheetWidth(windowWidth),
      alignSelf: "center",
      borderRadius: 24,
      borderBottomWidth: 1,
    } as const,
  };
};
