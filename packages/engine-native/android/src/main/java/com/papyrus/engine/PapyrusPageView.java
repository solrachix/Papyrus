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

import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class PapyrusPageView extends View {
  static final long MAX_RENDER_PIXELS = PapyrusRenderMath.MAX_RENDER_PIXELS;
  static final int MAX_RENDER_EDGE = PapyrusRenderMath.MAX_RENDER_EDGE;
  static final int RENDER_CACHE_BYTES = 32 * 1024 * 1024;
  private static final String TAG = "PapyrusPageView";
  private static final ExecutorService RENDER_EXECUTOR = Executors.newSingleThreadExecutor();
  private static final AtomicInteger ACTIVE_RENDER_REQUESTS = new AtomicInteger();
  private static final AtomicInteger ACTIVE_PAGE_VIEWS = new AtomicInteger();
  private static final Object CACHE_LOCK = new Object();
  private static final Map<Bitmap, Integer> ACTIVE_BITMAP_REFERENCES = new WeakHashMap<>();
  private static final Set<Bitmap> CACHED_BITMAPS = Collections.newSetFromMap(new IdentityHashMap<>());
  private static final Map<String, PapyrusNativeRenderTelemetry> CACHE_TELEMETRY = new java.util.HashMap<>();
  private static final LruCache<String, Bitmap> RENDER_CACHE = new LruCache<String, Bitmap>(RENDER_CACHE_BYTES) {
    @Override
    protected int sizeOf(String key, Bitmap value) {
      return value == null ? 0 : value.getByteCount();
    }

    @Override
    protected void entryRemoved(boolean evicted, String key, Bitmap oldValue, Bitmap newValue) {
      if (oldValue == null || oldValue == newValue) return;
      synchronized (CACHE_LOCK) {
        CACHED_BITMAPS.remove(oldValue);
        PapyrusNativeRenderTelemetry telemetry = CACHE_TELEMETRY.remove(key);
        recycleIfUnownedLocked(oldValue);
        if (telemetry != null) telemetry.emitCacheEvict();
      }
    }
  };
  private static final class ThemeFilters {
    private static final ColorMatrixColorFilter SEPIA = createSepiaFilter();
    private static final ColorMatrixColorFilter DARK = createDarkFilter();
    private static final ColorMatrixColorFilter HIGH_CONTRAST = createHighContrastFilter();
  }

  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private Bitmap bitmap;
  private PapyrusNativeRenderTelemetry activeTelemetry;
  private String pageTheme = "normal";
  private volatile int renderGeneration = 0;
  private String currentRenderKey = null;
  private final AtomicBoolean disposed = new AtomicBoolean(false);

  public PapyrusPageView(Context context) {
    super(context);
    ACTIVE_PAGE_VIEWS.incrementAndGet();
  }

  public PapyrusPageView(Context context, AttributeSet attrs) {
    super(context, attrs);
    ACTIVE_PAGE_VIEWS.incrementAndGet();
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
              final int rotation,
              final PapyrusRenderCompletion completion,
              final PapyrusNativeRenderTelemetry telemetry) {
    if (state == null || state.document == null) {
      telemetry.emit("native.render.stale");
      completion.complete(PapyrusRenderCompletion.Status.STALE);
      return;
    }
    if (state.isSearching) {
      telemetry.emit("native.render.stale");
      completion.complete(PapyrusRenderCompletion.Status.STALE);
      return;
    }
    if (getWidth() == 0 || getHeight() == 0) {
      post(() -> render(state, pageIndex, scale, zoom, rotation, completion, telemetry));
      return;
    }

    telemetry.traceBegin("PapyrusSurfaceLayout");
    final int viewWidth;
    final int viewHeight;
    final float targetScale;
    final int renderWidth;
    final int renderHeight;
    try {
      telemetry.emit("native.render.surface.start");
      viewWidth = getWidth();
      viewHeight = getHeight();
      final float clampedZoom = Math.max(0.1f, Math.min(5.0f, zoom));
      targetScale = Math.max(0.1f, scale) * clampedZoom;
      final int[] renderSize = PapyrusRenderMath.constrainCompatRenderSize(
        Math.max(1, (int) (viewWidth * targetScale)),
        Math.max(1, (int) (viewHeight * targetScale))
      );
      renderWidth = renderSize[0];
      renderHeight = renderSize[1];
    } finally {
      telemetry.traceEnd();
    }
    final String renderKey = buildRenderKey(state, pageIndex, renderWidth, renderHeight, targetScale, rotation);
    final int renderToken = ++renderGeneration;

    if (renderKey.equals(currentRenderKey) && bitmap != null && !bitmap.isRecycled()) {
      telemetry.emit("native.render.cache.hit");
      telemetry.emit("native.render.ui.start");
      telemetry.emit("native.render.install.start");
      activeTelemetry = telemetry;
      telemetry.emit("native.render.install.end");
      invalidate();
      telemetry.emit("native.render.invalidate");
      telemetry.emit("native.render.ready");
      completion.complete(PapyrusRenderCompletion.Status.READY);
      return;
    }

    Bitmap cached = RENDER_CACHE.get(renderKey);
    if (cached != null && !cached.isRecycled()) {
      telemetry.emit("native.render.cache.hit");
      currentRenderKey = renderKey;
      telemetry.emit("native.render.ui.start");
      telemetry.emit("native.render.install.start");
      installBitmap(cached);
      activeTelemetry = telemetry;
      telemetry.emit("native.render.install.end");
      invalidate();
      telemetry.emit("native.render.invalidate");
      telemetry.emit("native.render.ready");
      completion.complete(PapyrusRenderCompletion.Status.READY);
      return;
    }

    telemetry.emit("native.render.cache.miss");
    telemetry.emit("native.render.enqueue");
    ACTIVE_RENDER_REQUESTS.incrementAndGet();
    try {
      RENDER_EXECUTOR.execute(() -> {
        try {
          telemetry.emit("native.render.worker.start");
          PdfDocument doc = state.document;
          if (doc == null) {
            telemetry.emit("native.render.stale");
            completion.complete(PapyrusRenderCompletion.Status.STALE);
            return;
          }
          if (renderToken != renderGeneration) {
            telemetry.emit("native.render.stale");
            completion.complete(PapyrusRenderCompletion.Status.STALE);
            return;
          }

          try {
        Bitmap rendered = null;
        telemetry.emit("native.render.lock.wait.start");
        synchronized (state.pdfiumLock) {
          telemetry.emit("native.render.lock.acquired");
          if (renderToken != renderGeneration) {
            telemetry.emit("native.render.stale");
            completion.complete(PapyrusRenderCompletion.Status.STALE);
            return;
          }
          if (doc != state.document) {
            telemetry.emit("native.render.stale");
            completion.complete(PapyrusRenderCompletion.Status.STALE);
            return;
          }
          int pageCount = state.pdfium.getPageCount(doc);
          if (pageIndex < 0 || pageIndex >= pageCount) {
            telemetry.emit("native.render.stale");
            completion.complete(PapyrusRenderCompletion.Status.STALE);
            return;
          }
          state.pdfium.openPage(doc, pageIndex);
          rendered = Bitmap.createBitmap(renderWidth, renderHeight, Bitmap.Config.ARGB_8888);
          telemetry.emit("native.render.raster.start");
          state.pdfium.renderPageBitmap(doc, rendered, pageIndex, 0, 0, renderWidth, renderHeight, true);
          telemetry.emit("native.render.raster.end");
        }

        if (rendered == null) {
          telemetry.emit("native.render.stale");
          completion.complete(PapyrusRenderCompletion.Status.STALE);
          return;
        }
        final Bitmap renderedBitmap = rendered;

        telemetry.emit("native.render.ui.post");
        post(() -> {
          telemetry.traceBegin("PapyrusRenderUiCallback");
          try {
            telemetry.emit("native.render.ui.start");
            if (renderToken != renderGeneration) {
              if (!renderedBitmap.isRecycled()) {
                renderedBitmap.recycle();
              }
              telemetry.emit("native.render.stale");
              completion.complete(PapyrusRenderCompletion.Status.STALE);
              return;
            }
            putCachedBitmap(renderKey, renderedBitmap, telemetry);
            currentRenderKey = renderKey;
            telemetry.emit("native.render.install.start");
            installBitmap(renderedBitmap);
            activeTelemetry = telemetry;
            telemetry.emit("native.render.install.end");
            invalidate();
            telemetry.emit("native.render.invalidate");
            telemetry.emit("native.render.ready");
            completion.complete(PapyrusRenderCompletion.Status.READY);
          } finally {
            telemetry.traceEnd();
          }
        });
          } catch (OutOfMemoryError error) {
            Log.e(TAG, "Unable to allocate bitmap for PDF page; keeping previous surface", error);
            telemetry.emit("native.render.error");
            completion.error(error);
          } catch (RuntimeException error) {
            Log.w(TAG, "Failed to render PDF page; keeping previous surface", error);
            telemetry.emit("native.render.error");
            completion.error(error);
          }
        } finally {
          ACTIVE_RENDER_REQUESTS.decrementAndGet();
        }
      });
    } catch (RuntimeException error) {
      ACTIVE_RENDER_REQUESTS.decrementAndGet();
      telemetry.emit("native.render.error");
      completion.error(error);
    }
  }

  static Map<String, Integer> lifecycleStats() {
    Map<String, Integer> stats = new java.util.HashMap<>();
    synchronized (CACHE_LOCK) {
      int activeBitmapRefs = 0;
      for (Integer references : ACTIVE_BITMAP_REFERENCES.values()) {
        if (references != null) activeBitmapRefs += references;
      }
      stats.put("renderCacheBytes", RENDER_CACHE.size());
      stats.put("renderCacheEntries", RENDER_CACHE.snapshot().size());
      stats.put("activeBitmapRefs", activeBitmapRefs);
      stats.put("cachedBitmapCount", CACHED_BITMAPS.size());
      stats.put("activeRenderRequests", ACTIVE_RENDER_REQUESTS.get());
      stats.put("activePageViews", ACTIVE_PAGE_VIEWS.get());
    }
    return stats;
  }

  void render(final PapyrusEngineStore.EngineState state,
              final int pageIndex,
              final float scale,
              final float zoom,
              final int rotation) {
    render(state, pageIndex, scale, zoom, rotation, new PapyrusRenderCompletion(status -> { }),
      PapyrusNativeRenderTelemetry.from(null, "native-render-untracked", null, pageIndex, getId(), 0));
  }

  void dispose() {
    if (!disposed.compareAndSet(false, true)) return;
    ACTIVE_PAGE_VIEWS.decrementAndGet();
    renderGeneration += 1;
    Bitmap current = bitmap;
    bitmap = null;
    currentRenderKey = null;
    activeTelemetry = null;
    releaseBitmap(current);
  }

  @Override
  protected void onDraw(Canvas canvas) {
    super.onDraw(canvas);
    if (bitmap == null) return;
    Rect dest = new Rect(0, 0, getWidth(), getHeight());
    PapyrusNativeRenderTelemetry drawTelemetry = activeTelemetry;
    if (drawTelemetry != null) drawTelemetry.traceBegin("PapyrusPageDraw");
    try {
      if (drawTelemetry != null) drawTelemetry.emitDrawOnce();
      paint.setColorFilter(resolveThemeFilter(pageTheme));
      canvas.drawBitmap(bitmap, null, dest, paint);
      paint.setColorFilter(null);
      if (drawTelemetry != null) drawTelemetry.emitDrawEnd();
    } catch (RuntimeException error) {
      Log.w(TAG, "Failed to draw rendered page bitmap safely", error);
      releaseBitmap(bitmap);
      bitmap = null;
    } finally {
      if (drawTelemetry != null) drawTelemetry.traceEnd();
    }
  }

  static int[] constrainRenderSize(int requestedWidth, int requestedHeight) {
    return PapyrusRenderMath.constrainCompatRenderSize(requestedWidth, requestedHeight);
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

  private static void putCachedBitmap(String key, Bitmap value, PapyrusNativeRenderTelemetry telemetry) {
    synchronized (CACHE_LOCK) {
      CACHED_BITMAPS.add(value);
    }
    RENDER_CACHE.put(key, value);
    synchronized (CACHE_LOCK) {
      if (telemetry.isEnabled()) CACHE_TELEMETRY.put(key, telemetry);
    }
    telemetry.emitCachePut();
  }

  private void installBitmap(Bitmap nextBitmap) {
    if (bitmap == nextBitmap) return;
    releaseBitmap(bitmap);
    bitmap = nextBitmap;
    retainBitmap(nextBitmap);
  }

  private static void retainBitmap(Bitmap value) {
    if (value == null) return;
    synchronized (CACHE_LOCK) {
      Integer references = ACTIVE_BITMAP_REFERENCES.get(value);
      ACTIVE_BITMAP_REFERENCES.put(value, references == null ? 1 : references + 1);
    }
  }

  private static void releaseBitmap(Bitmap value) {
    if (value == null) return;
    synchronized (CACHE_LOCK) {
      Integer references = ACTIVE_BITMAP_REFERENCES.get(value);
      if (references == null || references <= 1) {
        ACTIVE_BITMAP_REFERENCES.remove(value);
      } else {
        ACTIVE_BITMAP_REFERENCES.put(value, references - 1);
      }
      recycleIfUnownedLocked(value);
    }
  }

  private static void recycleIfUnownedLocked(Bitmap value) {
    Integer references = ACTIVE_BITMAP_REFERENCES.get(value);
    boolean cached = CACHED_BITMAPS.contains(value);
    int activeReferences = references == null ? 0 : references;
    if (PapyrusBitmapOwnership.shouldRecycleEvictedBitmap(cached, activeReferences) && !value.isRecycled()) {
      value.recycle();
    }
  }

  private static ColorMatrixColorFilter resolveThemeFilter(String theme) {
    if ("sepia".equals(theme)) return ThemeFilters.SEPIA;
    if ("dark".equals(theme)) return ThemeFilters.DARK;
    if ("high-contrast".equals(theme)) return ThemeFilters.HIGH_CONTRAST;
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
