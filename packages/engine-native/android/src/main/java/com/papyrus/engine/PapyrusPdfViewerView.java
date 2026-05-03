package com.papyrus.engine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.util.LruCache;
import android.util.Log;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import com.shockwave.pdfium.PdfDocument;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PapyrusPdfViewerView extends View {
  private static final String TAG = "PapyrusPdfViewerView";
  private static final int PAGE_GAP = 28;
  private static final int PAGE_PADDING = 16;
  private static final int RENDER_CACHE_BYTES = 48 * 1024 * 1024;
  private static final ExecutorService RENDER_EXECUTOR = Executors.newFixedThreadPool(2);
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

  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
  private final ScaleGestureDetector scaleDetector;
  private final List<PageFrame> pageFrames = new ArrayList<>();
  private final Set<String> loadingKeys = new HashSet<>();
  private String engineId;
  private String pageTheme = "normal";
  private float zoom = 1.0f;
  private float offsetX = 0f;
  private float offsetY = 0f;
  private float contentWidth = 0f;
  private float contentHeight = 0f;
  private float lastTouchX = 0f;
  private float lastTouchY = 0f;
  private boolean layoutDirty = true;

  public PapyrusPdfViewerView(Context context) {
    super(context);
    scaleDetector = createScaleDetector(context);
  }

  public PapyrusPdfViewerView(Context context, AttributeSet attrs) {
    super(context, attrs);
    scaleDetector = createScaleDetector(context);
  }

  public void setEngineId(String nextEngineId) {
    if (nextEngineId != null && nextEngineId.equals(engineId)) return;
    engineId = nextEngineId;
    layoutDirty = true;
    invalidate();
  }

  public void setPageTheme(String nextPageTheme) {
    String normalized = nextPageTheme == null ? "normal" : nextPageTheme;
    if (normalized.equals(pageTheme)) return;
    pageTheme = normalized;
    invalidate();
  }

  public void setZoom(float nextZoom) {
    float clamped = clamp(nextZoom, 0.5f, 5.0f);
    if (Math.abs(clamped - zoom) < 0.001f) return;
    zoom = clamped;
    layoutDirty = true;
    clampOffsets();
    invalidate();
  }

  public void setCurrentPage(int page) {
    if (page <= 0 || engineId == null) return;
    ensureLayout();
    if (page > pageFrames.size()) return;
    offsetY = pageFrames.get(page - 1).top;
    clampOffsets();
    invalidate();
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldw, int oldh) {
    super.onSizeChanged(w, h, oldw, oldh);
    layoutDirty = true;
    clampOffsets();
  }

  @Override
  public boolean onTouchEvent(MotionEvent event) {
    scaleDetector.onTouchEvent(event);

    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        return true;
      case MotionEvent.ACTION_MOVE:
        if (!scaleDetector.isInProgress() && event.getPointerCount() == 1) {
          offsetX += lastTouchX - event.getX();
          offsetY += lastTouchY - event.getY();
          clampOffsets();
          invalidate();
        }
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        return true;
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        return true;
      default:
        return true;
    }
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    ensureLayout();
    canvas.drawColor(resolveBackgroundColor(pageTheme));
    if (pageFrames.isEmpty()) return;

    for (PageFrame frame : pageFrames) {
      int left = Math.round(frame.left - offsetX);
      int top = Math.round(frame.top - offsetY);
      int right = Math.round(left + frame.width);
      int bottom = Math.round(top + frame.height);
      if (bottom < 0 || top > getHeight()) continue;

      paint.setColor(resolvePageColor(pageTheme));
      paint.setColorFilter(null);
      canvas.drawRect(left, top, right, bottom, paint);

      String key = buildRenderKey(frame);
      Bitmap bitmap = RENDER_CACHE.get(key);
      if (bitmap != null && !bitmap.isRecycled()) {
        try {
          paint.setColorFilter(resolveThemeFilter(pageTheme));
          canvas.drawBitmap(bitmap, null, new Rect(left, top, right, bottom), paint);
          paint.setColorFilter(null);
        } catch (RuntimeException error) {
          Log.w(TAG, "Failed to draw dedicated PDF page", error);
        }
      } else {
        requestRender(frame, key);
      }
    }
  }

  private ScaleGestureDetector createScaleDetector(Context context) {
    return new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
      @Override
      public boolean onScale(ScaleGestureDetector detector) {
        float oldContentWidth = Math.max(1f, contentWidth);
        float oldContentHeight = Math.max(1f, contentHeight);
        float focusRatioX = (offsetX + detector.getFocusX()) / oldContentWidth;
        float focusRatioY = (offsetY + detector.getFocusY()) / oldContentHeight;
        zoom = clamp(zoom * detector.getScaleFactor(), 0.5f, 5.0f);
        layoutDirty = true;
        ensureLayout();
        offsetX = focusRatioX * contentWidth - detector.getFocusX();
        offsetY = focusRatioY * contentHeight - detector.getFocusY();
        clampOffsets();
        invalidate();
        return true;
      }
    });
  }

  private void ensureLayout() {
    if (!layoutDirty) return;
    pageFrames.clear();
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null || getWidth() <= 0) {
      contentWidth = getWidth();
      contentHeight = getHeight();
      layoutDirty = false;
      return;
    }

    try {
      synchronized (state.pdfiumLock) {
        PdfDocument document = state.document;
        int pageCount = state.pdfium.getPageCount(document);
        float y = PAGE_PADDING;
        float maxWidth = getWidth();
        int availableWidth = Math.max(1, getWidth() - PAGE_PADDING * 2);
        for (int i = 0; i < pageCount; i += 1) {
          state.pdfium.openPage(document, i);
          int pageWidth = Math.max(1, state.pdfium.getPageWidthPoint(document, i));
          int pageHeight = Math.max(1, state.pdfium.getPageHeightPoint(document, i));
          float baseScale = availableWidth / (float) pageWidth;
          float width = pageWidth * baseScale * zoom;
          float height = pageHeight * baseScale * zoom;
          maxWidth = Math.max(maxWidth, width + PAGE_PADDING * 2);
          float left = Math.max(PAGE_PADDING, (maxWidth - width) / 2f);
          pageFrames.add(new PageFrame(i, left, y, width, height));
          y += height + PAGE_GAP;
        }
        contentWidth = maxWidth;
        contentHeight = Math.max(getHeight(), y + PAGE_PADDING);
      }
    } catch (Throwable error) {
      Log.w(TAG, "Failed to layout dedicated PDF viewer", error);
      contentWidth = getWidth();
      contentHeight = getHeight();
    }
    layoutDirty = false;
    clampOffsets();
  }

  private void requestRender(PageFrame frame, String key) {
    if (loadingKeys.contains(key)) return;
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null || state.isSearching) return;
    loadingKeys.add(key);
    int[] renderSize = PapyrusRenderMath.constrainRenderSize(
      Math.max(1, Math.round(frame.width)),
      Math.max(1, Math.round(frame.height))
    );
    int renderWidth = renderSize[0];
    int renderHeight = renderSize[1];

    RENDER_EXECUTOR.execute(() -> {
      Bitmap rendered = null;
      try {
        synchronized (state.pdfiumLock) {
          if (state.document == null) return;
          state.pdfium.openPage(state.document, frame.index);
          rendered = Bitmap.createBitmap(renderWidth, renderHeight, Bitmap.Config.ARGB_8888);
          state.pdfium.renderPageBitmap(state.document, rendered, frame.index, 0, 0, renderWidth, renderHeight, true);
        }
        Bitmap finalRendered = rendered;
        post(() -> {
          loadingKeys.remove(key);
          if (finalRendered != null && !finalRendered.isRecycled()) {
            RENDER_CACHE.put(key, finalRendered);
          }
          invalidate();
        });
      } catch (Throwable error) {
        Bitmap failed = rendered;
        post(() -> {
          loadingKeys.remove(key);
          if (failed != null && !failed.isRecycled()) failed.recycle();
          Log.w(TAG, "Failed to render dedicated PDF page", error);
        });
      }
    });
  }

  private String buildRenderKey(PageFrame frame) {
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    int docIdentity = state == null || state.document == null ? 0 : System.identityHashCode(state.document);
    String source = state == null || state.sourcePath == null ? "" : state.sourcePath;
    return source + ":" + docIdentity + ":" + frame.index + ":" + Math.round(frame.width) + "x" + Math.round(frame.height);
  }

  private void clampOffsets() {
    offsetX = clamp(offsetX, 0f, Math.max(0f, contentWidth - getWidth()));
    offsetY = clamp(offsetY, 0f, Math.max(0f, contentHeight - getHeight()));
  }

  private static float clamp(float value, float min, float max) {
    return Math.max(min, Math.min(max, value));
  }

  private static int resolveBackgroundColor(String theme) {
    if ("dark".equals(theme) || "high-contrast".equals(theme)) return Color.rgb(15, 17, 21);
    if ("sepia".equals(theme)) return Color.rgb(232, 220, 196);
    return Color.rgb(233, 236, 239);
  }

  private static int resolvePageColor(String theme) {
    if ("dark".equals(theme) || "high-contrast".equals(theme)) return Color.rgb(24, 24, 27);
    if ("sepia".equals(theme)) return Color.rgb(245, 236, 214);
    return Color.WHITE;
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
    return new ColorMatrixColorFilter(invert);
  }

  private static ColorMatrixColorFilter createHighContrastFilter() {
    return createDarkFilter();
  }

  private static final class PageFrame {
    final int index;
    final float left;
    final float top;
    final float width;
    final float height;

    PageFrame(int index, float left, float top, float width, float height) {
      this.index = index;
      this.left = left;
      this.top = top;
      this.width = width;
      this.height = height;
    }
  }
}
