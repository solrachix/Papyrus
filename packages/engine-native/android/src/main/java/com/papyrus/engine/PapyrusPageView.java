package com.papyrus.engine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.util.Log;
import android.view.View;

import com.shockwave.pdfium.PdfDocument;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PapyrusPageView extends View {
  static final long MAX_RENDER_PIXELS = 8L * 1024L * 1024L;
  static final int MAX_RENDER_EDGE = 4096;
  private static final String TAG = "PapyrusPageView";
  private static final ExecutorService RENDER_EXECUTOR = Executors.newSingleThreadExecutor();
  private static final ColorMatrixColorFilter SEPIA_FILTER = createSepiaFilter();
  private static final ColorMatrixColorFilter DARK_FILTER = createDarkFilter();
  private static final ColorMatrixColorFilter HIGH_CONTRAST_FILTER = createHighContrastFilter();

  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private Bitmap bitmap;
  private String pageTheme = "normal";

  public PapyrusPageView(Context context) {
    super(context);
  }

  public PapyrusPageView(Context context, AttributeSet attrs) {
    super(context, attrs);
  }

  public void setPageTheme(String nextPageTheme) {
    String normalized = nextPageTheme == null ? "normal" : nextPageTheme;
    if (normalized.equals(pageTheme)) return;
    pageTheme = normalized;
    invalidate();
  }

  void render(final PapyrusEngineStore.EngineState state,
              final int pageIndex,
              final float scale,
              final float zoom,
              final int rotation) {
    if (state == null || state.document == null) return;
    if (state.isSearching) return;
    if (getWidth() == 0 || getHeight() == 0) {
      post(() -> render(state, pageIndex, scale, zoom, rotation));
      return;
    }

    final int viewWidth = getWidth();
    final int viewHeight = getHeight();
    final float clampedZoom = Math.max(0.1f, Math.min(5.0f, zoom));
    final float targetScale = Math.max(0.1f, scale) * clampedZoom;
    final int[] renderSize = constrainRenderSize(
      Math.max(1, (int) (viewWidth * targetScale)),
      Math.max(1, (int) (viewHeight * targetScale))
    );
    final int renderWidth = renderSize[0];
    final int renderHeight = renderSize[1];

    RENDER_EXECUTOR.execute(() -> {
      PdfDocument doc = state.document;
      if (doc == null) return;

      try {
        Bitmap rendered = null;
        synchronized (state.pdfiumLock) {
          if (doc != state.document) return;
          int pageCount = state.pdfium.getPageCount(doc);
          if (pageIndex < 0 || pageIndex >= pageCount) return;
          state.pdfium.openPage(doc, pageIndex);
          rendered = Bitmap.createBitmap(renderWidth, renderHeight, Bitmap.Config.ARGB_8888);
          state.pdfium.renderPageBitmap(doc, rendered, pageIndex, 0, 0, renderWidth, renderHeight, true);
        }

        if (rendered == null) return;
        final Bitmap renderedBitmap = rendered;

        post(() -> {
          if (bitmap != null && !bitmap.isRecycled()) {
            bitmap.recycle();
          }
          bitmap = renderedBitmap;
          invalidate();
        });
      } catch (Throwable ignored) {
      }
    });
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    if (bitmap == null) return;
    Rect dest = new Rect(0, 0, getWidth(), getHeight());
    try {
      paint.setColorFilter(resolveThemeFilter(pageTheme));
      canvas.drawBitmap(bitmap, null, dest, paint);
      paint.setColorFilter(null);
    } catch (RuntimeException error) {
      Log.w(TAG, "Failed to draw rendered page bitmap safely", error);
      if (bitmap != null && !bitmap.isRecycled()) {
        bitmap.recycle();
      }
      bitmap = null;
    }
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

  private static ColorMatrixColorFilter resolveThemeFilter(String theme) {
    if ("sepia".equals(theme)) return SEPIA_FILTER;
    if ("dark".equals(theme)) return DARK_FILTER;
    if ("high-contrast".equals(theme)) return HIGH_CONTRAST_FILTER;
    return null;
  }

  private static ColorMatrixColorFilter createSepiaFilter() {
    ColorMatrix matrix = new ColorMatrix();
    matrix.set(new float[] {
      0.393f, 0.769f, 0.189f, 0, 0,
      0.349f, 0.686f, 0.168f, 0, 0,
      0.272f, 0.534f, 0.131f, 0, 0,
      0, 0, 0, 1, 0
    });
    return new ColorMatrixColorFilter(matrix);
  }

  private static ColorMatrixColorFilter createDarkFilter() {
    ColorMatrix invert = new ColorMatrix(new float[] {
      -1, 0, 0, 0, 255,
      0, -1, 0, 0, 255,
      0, 0, -1, 0, 255,
      0, 0, 0, 1, 0
    });
    ColorMatrix dim = new ColorMatrix(new float[] {
      0.92f, 0, 0, 0, 0,
      0, 0.92f, 0, 0, 0,
      0, 0, 0.92f, 0, 0,
      0, 0, 0, 1, 0
    });
    invert.postConcat(dim);
    return new ColorMatrixColorFilter(invert);
  }

  private static ColorMatrixColorFilter createHighContrastFilter() {
    ColorMatrix invert = new ColorMatrix(new float[] {
      -1, 0, 0, 0, 255,
      0, -1, 0, 0, 255,
      0, 0, -1, 0, 255,
      0, 0, 0, 1, 0
    });
    float contrast = 1.35f;
    float translate = 128f * (1f - contrast);
    ColorMatrix contrastMatrix = new ColorMatrix(new float[] {
      contrast, 0, 0, 0, translate,
      0, contrast, 0, 0, translate,
      0, 0, contrast, 0, translate,
      0, 0, 0, 1, 0
    });
    invert.postConcat(contrastMatrix);
    return new ColorMatrixColorFilter(invert);
  }
}
