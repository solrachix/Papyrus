export const TOOL_DOCK_SCROLL_THRESHOLD = 420;

export const shouldUseScrollablePrimaryToolsRow = (windowWidth: number) =>
  windowWidth < TOOL_DOCK_SCROLL_THRESHOLD;

const DRAWING_TOOL_IDS = new Set(["ink", "highlight", "underline"]);

export const resolveToolDockBaseIconColor = ({
  label,
  isDark,
}: {
  label: string;
  isDark: boolean;
}) => {
  if (label === "note") return "#f4c430";
  return isDark ? "#f8fafc" : "#111827";
};

export const resolveToolDockIconColor = ({
  toolId,
  isSelected,
  annotationColor,
  accentColor,
  baseIconColor,
}: {
  toolId: string;
  isSelected: boolean;
  annotationColor: string;
  accentColor: string;
  baseIconColor: string;
}) => {
  if (!isSelected) return baseIconColor;
  return DRAWING_TOOL_IDS.has(toolId) ? annotationColor : accentColor;
};
