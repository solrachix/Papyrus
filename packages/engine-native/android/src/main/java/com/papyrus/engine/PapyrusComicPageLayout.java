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
}
