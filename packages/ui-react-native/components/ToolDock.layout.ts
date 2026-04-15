export const TOOL_DOCK_SCROLL_THRESHOLD = 420;

export const shouldUseScrollablePrimaryToolsRow = (windowWidth: number) =>
  windowWidth < TOOL_DOCK_SCROLL_THRESHOLD;
