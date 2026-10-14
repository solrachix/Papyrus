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
  static int zoomedFallbackHeight(int viewportWidth, int viewportHeight,
      String layoutMode, String fitMode, float zoom) {
    return zoomedHeight(0, 0, viewportWidth, viewportHeight, layoutMode, fitMode, zoom);
  }
  static float clampPanX(float x, int viewportWidth, float zoom) {
    return Math.max(-Math.max(0, zoomedWidth(viewportWidth, zoom) - viewportWidth), Math.min(0f, x));
  }
  static int zoomAnchorTopForItem(int oldTop, float focusY, int oldHeight, float oldZoom, float newZoom) {
    int safeOldHeight = Math.max(1, oldHeight);
    float fraction = Math.max(0f, Math.min(1f, (focusY - oldTop) / safeOldHeight));
    float scale = Math.max(1f, newZoom) / Math.max(1f, oldZoom);
    int newHeight = Math.max(1, Math.round(oldHeight * scale));
    return Math.round(focusY - fraction * newHeight);
  }

  static boolean canRestoreAnchor(String sourceEngineId, int sourceGeneration,
      String currentEngineId, int currentGeneration, boolean continuous,
      int position, int currentPageCount) {
    boolean sameEngine = sourceEngineId == null
      ? currentEngineId == null : sourceEngineId.equals(currentEngineId);
    return sameEngine && sourceGeneration == currentGeneration && continuous &&
      position >= 0 && position < currentPageCount;
  }

  static float panForLayout(float x, int viewportWidth, float zoom, boolean toContinuous) {
    float halfOverflow = Math.max(0, zoomedWidth(viewportWidth, zoom) - viewportWidth) / 2f;
    return toContinuous ? clampPanX(x - halfOverflow, viewportWidth, zoom)
      : Math.max(-halfOverflow, Math.min(halfOverflow, x + halfOverflow));
  }

}
