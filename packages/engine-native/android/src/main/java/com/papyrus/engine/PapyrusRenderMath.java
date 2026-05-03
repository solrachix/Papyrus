package com.papyrus.engine;

final class PapyrusRenderMath {
  static final long MAX_RENDER_PIXELS = 8L * 1024L * 1024L;
  static final int MAX_RENDER_EDGE = 4096;

  private PapyrusRenderMath() {
  }

  static int[] constrainRenderSize(int requestedWidth, int requestedHeight) {
    int width = Math.max(1, requestedWidth);
    int height = Math.max(1, requestedHeight);
    double scale = 1.0d;

    if (width > MAX_RENDER_EDGE || height > MAX_RENDER_EDGE) {
      scale = Math.min(
        scale,
        Math.min((double) MAX_RENDER_EDGE / width, (double) MAX_RENDER_EDGE / height)
      );
    }

    long pixels = (long) width * (long) height;
    if (pixels > MAX_RENDER_PIXELS) {
      scale = Math.min(scale, Math.sqrt((double) MAX_RENDER_PIXELS / (double) pixels));
    }

    if (scale >= 1.0d) {
      return new int[] { width, height };
    }

    int safeWidth = Math.max(1, (int) Math.floor(width * scale));
    int safeHeight = Math.max(1, (int) Math.floor(height * scale));
    return new int[] { safeWidth, safeHeight };
  }

  static String buildRenderKey(String sourcePath,
                               int documentIdentity,
                               int pageIndex,
                               int renderWidth,
                               int renderHeight,
                               float targetScale,
                               int rotation) {
    String source = sourcePath == null ? "" : sourcePath;
    int scaleBucket = Math.round(targetScale * 1000f);
    return source + ":" + documentIdentity + ":" + pageIndex + ":" + renderWidth + "x" + renderHeight + ":" + scaleBucket + ":" + rotation;
  }
}
