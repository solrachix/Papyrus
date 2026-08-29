export type ContextualUiSize = { width: number; height: number };
export type ContextualUiViewport = { width: number; height: number };
export type ContextualUiAnchor = { x: number; y: number };

export const resolveContextualUiPosition = (
  anchor: ContextualUiAnchor,
  size: ContextualUiSize,
  viewport: ContextualUiViewport,
  margin = 8
) => {
  let left = anchor.x;
  let top = anchor.y;

  if (left + size.width > viewport.width - margin) {
    left -= left + size.width - (viewport.width - margin);
  }
  if (top + size.height > viewport.height - margin) {
    top = anchor.y - size.height - margin;
  }

  return {
    left: Math.max(margin, Math.min(left, viewport.width - size.width - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - size.height - margin)),
  };
};
