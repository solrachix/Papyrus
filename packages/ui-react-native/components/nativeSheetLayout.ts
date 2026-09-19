export const getNativeSheetSizeStyle = (maxHeight?: number | string) => {
  if (!maxHeight) return null;
  return {
    maxHeight,
    ...(typeof maxHeight === "number" ? { height: maxHeight } : {}),
  };
};

export const getNativeSheetWidth = (windowWidth: number) => {
  if (!Number.isFinite(windowWidth) || windowWidth <= 0) return 0;
  if (windowWidth < 768) return windowWidth;

  return Math.min(640, windowWidth - 64);
};

export const getNativeSheetLayoutStyles = (windowWidth: number) => {
  if (!Number.isFinite(windowWidth) || windowWidth < 768) return null;

  return {
    root: {
      justifyContent: "center",
      paddingHorizontal: 32,
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
