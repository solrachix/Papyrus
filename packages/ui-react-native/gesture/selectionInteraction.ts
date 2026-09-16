export type ViewerScrollState = {
  selectionDragActive: boolean;
  gestureScrollLockActive?: boolean;
};

export type SelectionGestureTool =
  | "select"
  | "highlight"
  | "underline"
  | "squiggly"
  | "strikeout"
  | "text"
  | "comment"
  | "ink";

export type SelectionInteractionMode = "pan" | "select";

export type SelectionGestureActivationInput = {
  activeTool: SelectionGestureTool;
  interactionMode: SelectionInteractionMode;
};

export type ToolDockSelectionState = SelectionGestureActivationInput & {
  toolId: SelectionGestureTool;
};

export type ToolDockDismissState = SelectionGestureActivationInput & {
  toolDockOpen: boolean;
};

export type SelectionEdgeAutoscrollInput = {
  x: number;
  y: number;
  width: number;
  height: number;
  threshold: number;
  maxStep: number;
};

export type SelectionEdgeAutoscroll = {
  dx: number;
  dy: number;
};

export type SelectionDragPoint = {
  x: number;
  y: number;
};

export type SelectionDragRectInput = {
  start: SelectionDragPoint;
  end: SelectionDragPoint;
  width: number;
  height: number;
  lineThreshold: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const DRAG_SELECTION_TOOLS = new Set<SelectionGestureTool>([
  "highlight",
  "underline",
  "squiggly",
  "strikeout",
]);

const resolveAxisAutoscroll = (
  coordinate: number,
  size: number,
  threshold: number,
  maxStep: number
) => {
  if (size <= 0 || threshold <= 0 || maxStep <= 0) return 0;

  const startDistance = clamp(coordinate, 0, size);
  if (startDistance < threshold) {
    const intensity = 1 - startDistance / threshold;
    return -Math.round(maxStep * intensity);
  }

  const endDistance = clamp(size - coordinate, 0, size);
  if (endDistance < threshold) {
    const intensity = 1 - endDistance / threshold;
    return Math.round(maxStep * intensity);
  }

  return 0;
};

export const shouldEnableViewerScroll = ({
  selectionDragActive,
  gestureScrollLockActive = false,
}: ViewerScrollState) => !selectionDragActive && !gestureScrollLockActive;

export const shouldEnableSelectionDrag = ({
  activeTool,
  interactionMode,
}: SelectionGestureActivationInput) =>
  DRAG_SELECTION_TOOLS.has(activeTool) ||
  (activeTool === "select" && interactionMode === "select");

export const isToolDockToolSelected = ({
  activeTool,
  interactionMode,
  toolId,
}: ToolDockSelectionState) =>
  toolId === "select"
    ? activeTool === "select" && interactionMode === "select"
    : activeTool === toolId;

export const getToolDockDismissState = ({
  activeTool: _activeTool,
  interactionMode: _interactionMode,
}: SelectionGestureActivationInput): ToolDockDismissState => ({
  toolDockOpen: false,
  activeTool: "select",
  interactionMode: "pan",
});

export const getSelectionEdgeAutoscroll = ({
  x,
  y,
  width,
  height,
  threshold,
  maxStep,
}: SelectionEdgeAutoscrollInput): SelectionEdgeAutoscroll => ({
  dx: resolveAxisAutoscroll(x, width, threshold, maxStep),
  dy: resolveAxisAutoscroll(y, height, threshold, maxStep),
});

export const resolveSelectionDragRect = ({
  start,
  end,
  width,
  height,
  lineThreshold,
}: SelectionDragRectInput) => {
  const top = Math.max(0, Math.min(start.y, end.y));
  const bottom = Math.min(height, Math.max(start.y, end.y));
  const crossesLine = Math.abs(end.y - start.y) > lineThreshold;

  if (!crossesLine) {
    const left = Math.max(0, Math.min(start.x, end.x));
    const right = Math.min(width, Math.max(start.x, end.x));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  const left = end.y >= start.y ? start.x : 0;
  const right = end.y >= start.y ? width : start.x;
  const clampedLeft = Math.max(0, Math.min(width, left));
  const clampedRight = Math.max(clampedLeft, Math.min(width, right));
  return {
    x: clampedLeft,
    y: top,
    width: clampedRight - clampedLeft,
    height: bottom - top,
  };
};
