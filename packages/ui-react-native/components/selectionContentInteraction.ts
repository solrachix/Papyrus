export type SelectionContentInteraction = "tap" | "scroll";

export const shouldDismissSelectionOnContentInteraction = ({
  selectionActive,
  interaction,
}: {
  selectionActive: boolean;
  interaction: SelectionContentInteraction;
}): boolean => selectionActive && (interaction === "tap" || interaction === "scroll");

export type SelectionUiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const isPointInsideSelectionUi = ({
  point,
  hitRects,
  padding,
}: {
  point: { x: number; y: number };
  hitRects: SelectionUiRect[];
  padding: number;
}): boolean =>
  hitRects.some(
    (rect) =>
      point.x >= rect.x - padding &&
      point.x <= rect.x + rect.width + padding &&
      point.y >= rect.y - padding &&
      point.y <= rect.y + rect.height + padding
  );
