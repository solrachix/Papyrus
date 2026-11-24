import type { EpubSelectionRect } from "./epubAnnotationEvents";

export type SelectionMenuPlacement = "above" | "below";
export type SelectionMenuPosition = { left: number; top: number; placement: SelectionMenuPlacement };

export const SELECTION_MENU_MARGIN = 12;
/** Gap above the selection. */
export const SELECTION_MENU_GAP_ABOVE = 10;
/** Below the selection the Android selection handles hang under the text. */
export const SELECTION_MENU_GAP_BELOW = 30;

/**
 * Places the selection menu centred over the selection, clamped inside the
 * container with margins. It prefers the space above the selection and flips
 * below when there is no room. Returns null when the selection is scrolled
 * completely out of view, so the menu hides instead of pinning to an edge.
 */
export function getSelectionMenuPosition(input: {
  anchor: EpubSelectionRect;
  menu: { width: number; height: number };
  container: { width: number; height: number };
  /** Space reserved at the top (status bar / safe area). */
  topInset?: number;
  bottomInset?: number;
  margin?: number;
}): SelectionMenuPosition | null {
  const { anchor, menu, container } = input;
  const margin = input.margin ?? SELECTION_MENU_MARGIN;
  const minTop = Math.max(0, input.topInset ?? 0) + margin;
  const maxBottom = container.height - Math.max(0, input.bottomInset ?? 0) - margin;
  if (container.width <= 0 || container.height <= 0) return null;
  if (anchor.y + anchor.height < 0 || anchor.y > container.height) return null;
  if (anchor.x + anchor.width < 0 || anchor.x > container.width) return null;

  const centre = anchor.x + anchor.width / 2;
  const maxLeft = container.width - margin - menu.width;
  const left = maxLeft < margin ? Math.max(0, (container.width - menu.width) / 2) : Math.min(maxLeft, Math.max(margin, centre - menu.width / 2));

  const above = anchor.y - SELECTION_MENU_GAP_ABOVE - menu.height;
  if (above >= minTop) return { left, top: above, placement: "above" };
  const below = anchor.y + anchor.height + SELECTION_MENU_GAP_BELOW;
  if (below + menu.height <= maxBottom) return { left, top: below, placement: "below" };
  // A tall selection fills the screen: keep the menu visible, overlapping it.
  return { left, top: Math.max(minTop, Math.min(maxBottom - menu.height, below)), placement: "below" };
}
