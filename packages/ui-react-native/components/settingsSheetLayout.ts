export const getSettingsSheetMaxHeight = (windowHeight: number) =>
  Math.min(640, Math.max(0, windowHeight) * 0.72);
