package com.papyrus.engine;

final class PapyrusComicPageLayout {
  private PapyrusComicPageLayout() {}

  static int itemHeight(int imageWidth, int imageHeight, int viewportWidth, int viewportHeight,
      String layoutMode, String fitMode) {
    int safeViewportHeight = Math.max(1, viewportHeight);
    if (!"continuous".equals(layoutMode) || imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0) {
      return safeViewportHeight;
    }

    float ratio = (float) imageHeight / (float) imageWidth;
    int proposedHeight = Math.max(1, Math.round(Math.max(1, viewportWidth) * ratio));
    return "page".equals(fitMode) ? Math.min(safeViewportHeight, proposedHeight) : proposedHeight;
  }
  static int zoomedWidth(int viewportWidth, float zoom) {
    return Math.max(1, Math.round(Math.max(1, viewportWidth) * Math.max(1f, Math.min(5f, zoom))));
  }
  static int zoomedHeight(int imageWidth, int imageHeight, int viewportWidth, int viewportHeight,
      String layoutMode, String fitMode, float zoom) {
    int base = itemHeight(imageWidth, imageHeight, viewportWidth, viewportHeight, layoutMode, fitMode);
    return "continuous".equals(layoutMode) ? Math.max(1, Math.round(base * Math.max(1f, Math.min(5f, zoom)))) : base;
  }
  static float clampPanX(float x, int viewportWidth, float zoom) {
    return Math.max(-Math.max(0, zoomedWidth(viewportWidth, zoom) - viewportWidth), Math.min(0f, x));
  }
  static int zoomAnchorTop(int oldTop, float focusY, float oldZoom, float newZoom) {
    return Math.round(focusY + (oldTop - focusY) * newZoom / Math.max(1f, oldZoom));
  }

  static float panForLayout(float x, int viewportWidth, float zoom, boolean toContinuous) {
    float halfOverflow = Math.max(0, zoomedWidth(viewportWidth, zoom) - viewportWidth) / 2f;
    return toContinuous ? clampPanX(x - halfOverflow, viewportWidth, zoom)
      : Math.max(-halfOverflow, Math.min(halfOverflow, x + halfOverflow));
  }

}
