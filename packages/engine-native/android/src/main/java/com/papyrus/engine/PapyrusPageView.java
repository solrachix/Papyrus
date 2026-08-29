package com.papyrus.engine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.util.LruCache;
import android.util.Log;
import android.view.View;

import com.shockwave.pdfium.PdfDocument;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PapyrusPageView extends View {
  static final long MAX_RENDER_PIXELS = PapyrusRenderMath.MAX_RENDER_PIXELS;
  static final int MAX_RENDER_EDGE = PapyrusRenderMath.MAX_RENDER_EDGE;
  static final int RENDER_CACHE_BYTES = 32 * 1024 * 1024;
  private static final String TAG = "PapyrusPageView";
  private static final ExecutorService RENDER_EXECUTOR = Executors.newSingleThreadExecutor();
  private static final LruCache<String, Bitmap> RENDER_CACHE = new LruCache<String, Bitmap>(RENDER_CACHE_BYTES) {
    @Override
    protected int sizeOf(String key, Bitmap value) {
      return value == null ? 0 : value.getByteCount();
    }

    @Override
    protected void entryRemoved(boolean evicted, String key, Bitmap oldValue, Bitmap newValue) {
      if (oldValue != null && oldValue != newValue && !oldValue.isRecycled()) {
        oldValue.recycle();
      }
    }
  };
  private static final ColorMatrixColorFilter SEPIA_FILTER = createSepiaFilter();
  private static final ColorMatrixColorFilter DARK_FILTER = createDarkFilter();
  private static final ColorMatrixColorFilter HIGH_CONTRAST_FILTER = createHighContrastFilter();

  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private Bitmap bitmap;
  private String pageTheme = "normal";
  private int renderGeneration = 0;
  private String currentRenderKey = null;

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
    final int[] renderSize = PapyrusRenderMath.constrainRenderSize(
      Math.max(1, (int) (viewWidth * targetScale)),
      Math.max(1, (int) (viewHeight * targetScale))
    );
    final int renderWidth = renderSize[0];
    final int renderHeight = renderSize[1];
    final String renderKey = buildRenderKey(state, pageIndex, renderWidth, renderHeight, targetScale, rotation);
    final int renderToken = ++renderGeneration;

    if (renderKey.equals(currentRenderKey) && bitmap != null && !bitmap.isRecycled()) {
      invalidate();
      return;
    }

    Bitmap cached = RENDER_CACHE.get(renderKey);
    if (cached != null && !cached.isRecycled()) {
      currentRenderKey = renderKey;
      bitmap = cached;
      invalidate();
      return;
    }

    RENDER_EXECUTOR.execute(() -> {
      PdfDocument doc = state.document;
      if (doc == null) return;
      if (renderToken != renderGeneration) return;

      try {
        Bitmap rendered = null;
        synchronized (state.pdfiumLock) {
          if (renderToken != renderGeneration) return;
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
          if (renderToken != renderGeneration) {
            if (!renderedBitmap.isRecycled()) {
              renderedBitmap.recycle();
            }
            return;
          }
          RENDER_CACHE.put(renderKey, renderedBitmap);
          currentRenderKey = renderKey;
          bitmap = renderedBitmap;
          invalidate();
        });
      } catch (OutOfMemoryError error) {
        Log.e(TAG, "Unable to allocate bitmap for PDF page; keeping previous surface", error);
      } catch (RuntimeException error) {
        Log.w(TAG, "Failed to render PDF page; keeping previous surface", error);
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
    return PapyrusRenderMath.constrainRenderSize(requestedWidth, requestedHeight);
  }

  static String buildRenderKey(PapyrusEngineStore.EngineState state,
                               int pageIndex,
                               int renderWidth,
                               int renderHeight,
                               float targetScale,
                               int rotation) {
    String source = state == null || state.sourcePath == null ? "" : state.sourcePath;
    int documentIdentity = state == null || state.document == null ? 0 : System.identityHashCode(state.document);
    return PapyrusRenderMath.buildRenderKey(source, documentIdentity, pageIndex, renderWidth, renderHeight, targetScale, rotation);
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
