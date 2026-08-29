export const getNativeSheetSizeStyle = (maxHeight?: number | string) => {
  if (!maxHeight) return null;
  return {
    maxHeight,
    ...(typeof maxHeight === "number" ? { height: maxHeight } : {}),
  };
};
