/**
 * Pure rules for the swipe-down-to-dismiss gesture of NativeSheet.
 *
 * The handle/header can always start a dismiss drag. The sheet body only
 * does so when its scroll content is at the top, so scrolling a list never
 * turns into closing the sheet.
 */

/** Minimum downward travel before the sheet claims the touch. */
export const SHEET_DRAG_ACTIVATION_DISTANCE = 8;
/** Fling speed (px/ms, as PanResponder reports vy) that dismisses on release. */
export const SHEET_DISMISS_VELOCITY = 0.9;
/** Share of the sheet height that dismisses on release. */
export const SHEET_DISMISS_RATIO = 0.25;
/** Upper bound for the dismiss distance on tall sheets. */
export const SHEET_DISMISS_MAX_DISTANCE = 140;

export type SheetDragStartInput = {
  dx: number;
  dy: number;
  /** Vertical offset of the sheet's scroll content (0 = top). */
  scrollOffset: number;
  /** Whether the touch started on the drag handle / header. */
  fromHandle: boolean;
};

export const shouldStartSheetDismissDrag = ({
  dx,
  dy,
  scrollOffset,
  fromHandle,
}: SheetDragStartInput): boolean => {
  if (dy < SHEET_DRAG_ACTIVATION_DISTANCE) return false;
  if (Math.abs(dy) <= Math.abs(dx) * 1.5) return false;
  if (fromHandle) return true;
  return scrollOffset <= 0.5;
};

export const getSheetDismissDistance = (sheetHeight: number): number => {
  if (!Number.isFinite(sheetHeight) || sheetHeight <= 0) {
    return SHEET_DISMISS_MAX_DISTANCE;
  }
  return Math.min(SHEET_DISMISS_MAX_DISTANCE, sheetHeight * SHEET_DISMISS_RATIO);
};

export const shouldDismissSheetOnRelease = ({
  dy,
  vy,
  sheetHeight,
}: {
  dy: number;
  vy: number;
  sheetHeight: number;
}): boolean => {
  if (dy <= 0) return false;
  if (vy >= SHEET_DISMISS_VELOCITY && dy >= SHEET_DRAG_ACTIVATION_DISTANCE) return true;
  return dy >= getSheetDismissDistance(sheetHeight);
};

/** Sheets never follow the finger upward past their resting position. */
export const clampSheetDrag = (dy: number): number => (dy > 0 ? dy : 0);
