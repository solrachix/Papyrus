package com.papyrus.engine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorMatrix;
import android.graphics.ColorMatrixColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Handler;
import android.os.Looper;
import android.util.AttributeSet;
import android.util.LruCache;
import android.util.Log;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.VelocityTracker;
import android.view.View;
import android.widget.OverScroller;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;
import com.shockwave.pdfium.PdfDocument;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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
  private final Map<Integer, Bitmap> lastPageBitmap = new HashMap<>();
  private String engineId;
  private String pageTheme = "normal";
  private String activeTool = "select";
  private String annotationColor = "#111827";
  private float inkStrokeWidth = 0.006f;
  private float annotationOpacity = 0.85f;
  private float zoom = 1.0f;
  private float offsetX = 0f;
  private float offsetY = 0f;
  private float contentWidth = 0f;
  private float contentHeight = 0f;
  private float lastTouchX = 0f;
  private float lastTouchY = 0f;
  private boolean layoutDirty = true;
  private int renderGeneration = 0;
  private boolean wasScaling = false;
  private boolean isDrawingInk = false;
  private List<float[]> inkStrokePoints = new ArrayList<>();
  private int inkStrokePageIndex = -1;
  private long touchDownTime = 0;
  private float touchDownX = 0;
  private float touchDownY = 0;
  private static final long TAP_MAX_DURATION_MS = 300;
  private static final float TAP_MAX_DISTANCE_DP = 12;
  private final ReactContext reactContext;
  private final Handler eventThrottleHandler = new Handler(Looper.getMainLooper());
  private Runnable pendingZoomEvent;
  private final OverScroller flingScroller;
  private VelocityTracker velocityTracker;
  private final Runnable flingRunnable = new Runnable() {
    @Override
    public void run() {
      if (flingScroller.computeScrollOffset()) {
        offsetX = flingScroller.getCurrX();
        offsetY = flingScroller.getCurrY();
        clampOffsets();
        invalidate();
        postOnAnimation(this);
      } else {
        int visiblePage = computeVisiblePage();
        if (visiblePage > 0) {
          emitPageChanged(visiblePage);
        }
      }
    }
  };

  public PapyrusPdfViewerView(ReactContext context) {
    super(context);
    this.reactContext = context;
    scaleDetector = createScaleDetector(context);
    flingScroller = new OverScroller(context);
  }

  public PapyrusPdfViewerView(ReactContext context, AttributeSet attrs) {
    super(context, attrs);
    this.reactContext = context;
    scaleDetector = createScaleDetector(context);
    flingScroller = new OverScroller(context);
  }

  public void setEngineId(String nextEngineId) {
    if (nextEngineId != null && nextEngineId.equals(engineId)) return;
    engineId = nextEngineId;
    renderGeneration += 1;
    layoutDirty = true;
    invalidate();
  }

  public void setPageTheme(String nextPageTheme) {
    String normalized = nextPageTheme == null ? "normal" : nextPageTheme;
    if (normalized.equals(pageTheme)) return;
    pageTheme = normalized;
    renderGeneration += 1;
    invalidate();
  }

  public void setActiveTool(String tool) {
    String normalized = tool == null ? "select" : tool;
    if (normalized.equals(activeTool)) return;
    activeTool = normalized;
    if (isDrawingInk) {
      isDrawingInk = false;
      inkStrokePoints.clear();
      inkStrokePageIndex = -1;
      invalidate();
    }
  }

  public void setAnnotationColor(String color) {
    annotationColor = color == null ? "#111827" : color;
  }

  public void setInkStrokeWidth(float width) {
    inkStrokeWidth = width;
  }

  public void setAnnotationOpacity(float opacity) {
    annotationOpacity = opacity;
  }

  public void setZoom(float nextZoom) {
    float clamped = clamp(nextZoom, 0.5f, 5.0f);
    if (Math.abs(clamped - zoom) < 0.001f) return;
    zoom = clamped;
    renderGeneration += 1;
    layoutDirty = true;
    clampOffsets();
    invalidate();
  }

  public void setCurrentPage(int page) {
    if (page <= 0 || engineId == null) return;
    ensureLayout();
    if (page > pageFrames.size()) return;
    if (page <= pageFrames.size()) {
      PageFrame frame = pageFrames.get(page - 1);
      float frameTop = frame.top;
      float frameBottom = frame.top + frame.height;
      float viewportTop = offsetY;
      float viewportBottom = offsetY + getHeight();
      boolean isVisible = frameBottom > viewportTop && frameTop < viewportBottom;
      if (isVisible) return;
    }
    offsetY = pageFrames.get(page - 1).top;
    clampOffsets();
    invalidate();
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldw, int oldh) {
    super.onSizeChanged(w, h, oldw, oldh);
    renderGeneration += 1;
    layoutDirty = true;
    clampOffsets();
  }

  @Override
  public boolean onTouchEvent(MotionEvent event) {
    scaleDetector.onTouchEvent(event);

    if ("ink".equals(activeTool) && event.getPointerCount() == 1) {
      return handleInkTouch(event);
    }

    if (("text".equals(activeTool) || "comment".equals(activeTool)) && event.getPointerCount() == 1) {
      return handleTextCommentTouch(event);
    }

    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        if (velocityTracker == null) {
          velocityTracker = VelocityTracker.obtain();
        } else {
          velocityTracker.clear();
        }
        velocityTracker.addMovement(event);
        flingScroller.abortAnimation();
        removeCallbacks(flingRunnable);
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        touchDownTime = System.currentTimeMillis();
        touchDownX = event.getX();
        touchDownY = event.getY();
        return true;
      case MotionEvent.ACTION_MOVE:
        if (velocityTracker != null) {
          velocityTracker.addMovement(event);
        }
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
        if (wasScaling && !scaleDetector.isInProgress()) {
          wasScaling = false;
          emitZoomChanged(zoom);
        }
        if (!scaleDetector.isInProgress() && velocityTracker != null) {
          velocityTracker.addMovement(event);
          velocityTracker.computeCurrentVelocity(1000, 8000);
          float velocityX = velocityTracker.getXVelocity();
          float velocityY = velocityTracker.getYVelocity();
          if (Math.abs(velocityX) > 200 || Math.abs(velocityY) > 200) {
            flingScroller.fling(
              Math.round(offsetX),
              Math.round(offsetY),
              Math.round(-velocityX),
              Math.round(-velocityY),
              0,
              Math.max(0, Math.round(contentWidth - getWidth())),
              0,
              Math.max(0, Math.round(contentHeight - getHeight()))
            );
            postOnAnimation(flingRunnable);
          } else {
            int visiblePage = computeVisiblePage();
            if (visiblePage > 0) {
              emitPageChanged(visiblePage);
            }
          }
          velocityTracker.recycle();
          velocityTracker = null;
        }
        if (event.getActionMasked() == MotionEvent.ACTION_UP) {
          long duration = System.currentTimeMillis() - touchDownTime;
          float dx = event.getX() - touchDownX;
          float dy = event.getY() - touchDownY;
          float distance = (float) Math.hypot(dx, dy);
          float density = getResources().getDisplayMetrics().density;
          if (duration < TAP_MAX_DURATION_MS && distance < TAP_MAX_DISTANCE_DP * density) {
            ensureLayout();
            float docX = event.getX() + offsetX;
            float docY = event.getY() + offsetY;
            int pageIdx = findPageIndexAt(docX, docY);
            if (pageIdx >= 0) {
              PageFrame frame = pageFrames.get(pageIdx);
              float nx = (docX - frame.left) / frame.width;
              float ny = (docY - frame.top) / frame.height;
              Annotation hit = findAnnotationAt(pageIdx, nx, ny);
              if (hit != null) {
                emitAnnotationTap(hit);
              } else {
                emitTap(pageIdx, clamp01(nx), clamp01(ny));
              }
            }
          }
        }
        return true;
      default:
        return true;
    }
  }

  private boolean handleInkTouch(MotionEvent event) {
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        ensureLayout();
        inkStrokePageIndex = findPageIndexAt(event.getX() + offsetX, event.getY() + offsetY);
        if (inkStrokePageIndex < 0) return true;
        isDrawingInk = true;
        inkStrokePoints.clear();
        addInkPoint(event.getX() + offsetX, event.getY() + offsetY);
        invalidate();
        return true;
      case MotionEvent.ACTION_MOVE:
        if (isDrawingInk && inkStrokePageIndex >= 0) {
          addInkPoint(event.getX() + offsetX, event.getY() + offsetY);
          invalidate();
        }
        return true;
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        if (isDrawingInk && inkStrokePoints.size() >= 2) {
          emitAnnotationCreated();
        }
        isDrawingInk = false;
        inkStrokePoints.clear();
        inkStrokePageIndex = -1;
        invalidate();
        return true;
      default:
        return true;
    }
  }

  private boolean handleTextCommentTouch(MotionEvent event) {
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        touchDownTime = System.currentTimeMillis();
        touchDownX = event.getX();
        touchDownY = event.getY();
        return true;
      case MotionEvent.ACTION_UP:
        long duration = System.currentTimeMillis() - touchDownTime;
        float dx = event.getX() - touchDownX;
        float dy = event.getY() - touchDownY;
        float distance = (float) Math.hypot(dx, dy);
        float density = getResources().getDisplayMetrics().density;
        if (duration < TAP_MAX_DURATION_MS && distance < TAP_MAX_DISTANCE_DP * density) {
          ensureLayout();
          float docX = event.getX() + offsetX;
          float docY = event.getY() + offsetY;
          int pageIdx = findPageIndexAt(docX, docY);
          if (pageIdx >= 0) {
            PageFrame frame = pageFrames.get(pageIdx);
            float nx = clamp01((docX - frame.left) / frame.width);
            float ny = clamp01((docY - frame.top) / frame.height);
            emitAnnotationCreatedForTool(activeTool, pageIdx, nx, ny);
          }
        }
        return true;
      default:
        return true;
    }
  }

  private int findPageIndexAt(float docX, float docY) {
    for (PageFrame frame : pageFrames) {
      if (docX >= frame.left && docX <= frame.left + frame.width &&
          docY >= frame.top && docY <= frame.top + frame.height) {
        return frame.index;
      }
    }
    return -1;
  }

  private void addInkPoint(float docX, float docY) {
    if (inkStrokePageIndex < 0 || inkStrokePageIndex >= pageFrames.size()) return;
    PageFrame frame = pageFrames.get(inkStrokePageIndex);
    float nx = (docX - frame.left) / frame.width;
    float ny = (docY - frame.top) / frame.height;
    if (nx < 0) nx = 0; else if (nx > 1) nx = 1;
    if (ny < 0) ny = 0; else if (ny > 1) ny = 1;
    if (inkStrokePoints.size() > 0) {
      float[] last = inkStrokePoints.get(inkStrokePoints.size() - 1);
      float dx = nx - last[0];
      float dy = ny - last[1];
      if (dx * dx + dy * dy < 0.00000064f) return;
    }
    inkStrokePoints.add(new float[] { nx, ny });
  }

  private static float clamp01(float value) {
    return Math.max(0f, Math.min(1f, value));
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
        Bitmap fallback = lastPageBitmap.get(frame.index);
        if (fallback != null && !fallback.isRecycled()) {
          try {
            paint.setColorFilter(resolveThemeFilter(pageTheme));
            canvas.drawBitmap(fallback, null, new Rect(left, top, right, bottom), paint);
            paint.setColorFilter(null);
          } catch (RuntimeException error) {
            Log.w(TAG, "Failed to draw fallback PDF page", error);
          }
        }
        requestRender(frame, key);
      }
      drawOverlays(canvas, frame, left, top);
    }
  }

  private int computeVisiblePage() {
    if (pageFrames.isEmpty()) return 1;
    float viewportCenterY = offsetY + getHeight() / 2f;
    int bestPage = 1;
    float bestDistance = Float.MAX_VALUE;
    for (PageFrame frame : pageFrames) {
      float frameCenterY = frame.top + frame.height / 2f;
      float distance = Math.abs(frameCenterY - viewportCenterY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = frame.index + 1;
      }
    }
    return bestPage;
  }

  private void emitPageChanged(int page) {
    try {
      WritableMap event = Arguments.createMap();
      event.putInt("page", page);
      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onPageChanged", event);
    } catch (Throwable ignored) {
    }
  }

  private void emitZoomChanged(float zoomValue) {
    try {
      if (pendingZoomEvent != null) {
        eventThrottleHandler.removeCallbacks(pendingZoomEvent);
      }
      pendingZoomEvent = () -> {
        WritableMap event = Arguments.createMap();
        event.putDouble("zoom", zoomValue);
        reactContext.getJSModule(RCTEventEmitter.class)
          .receiveEvent(getId(), "onZoomChanged", event);
        pendingZoomEvent = null;
      };
      eventThrottleHandler.postDelayed(pendingZoomEvent, 120);
    } catch (Throwable ignored) {
    }
  }

  private void emitAnnotationCreated() {
    try {
      if (inkStrokePageIndex < 0 || inkStrokePoints.size() < 2) return;
      float minX = 1f, minY = 1f, maxX = 0f, maxY = 0f;
      for (float[] p : inkStrokePoints) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
      }
      float width = Math.max(0.0005f, maxX - minX);
      float height = Math.max(0.0005f, maxY - minY);

      WritableMap event = Arguments.createMap();
      event.putString("id", java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 7));
      event.putInt("pageIndex", inkStrokePageIndex);
      event.putString("type", "ink");
      event.putString("color", annotationColor);

      WritableMap rect = Arguments.createMap();
      rect.putDouble("x", minX);
      rect.putDouble("y", minY);
      rect.putDouble("width", width);
      rect.putDouble("height", height);
      event.putMap("rect", rect);

      WritableArray path = Arguments.createArray();
      for (float[] p : inkStrokePoints) {
        WritableMap point = Arguments.createMap();
        point.putDouble("x", p[0]);
        point.putDouble("y", p[1]);
        path.pushMap(point);
      }
      event.putArray("path", path);
      event.putDouble("opacity", annotationOpacity);
      event.putDouble("strokeWidth", inkStrokeWidth);
      event.putDouble("createdAt", System.currentTimeMillis());

      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onAnnotationCreated", event);
    } catch (Throwable ignored) {
    }
  }

  private void emitTap(int pageIndex, float x, float y) {
    try {
      WritableMap event = Arguments.createMap();
      event.putInt("pageIndex", pageIndex);
      event.putDouble("x", x);
      event.putDouble("y", y);
      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onTap", event);
    } catch (Throwable ignored) {
    }
  }

  private void emitAnnotationCreatedForTool(String tool, int pageIndex, float nx, float ny) {
    try {
      WritableMap event = Arguments.createMap();
      event.putString("id", java.util.UUID.randomUUID().toString().replace("-", "").substring(0, 7));
      event.putInt("pageIndex", pageIndex);
      event.putString("type", tool);
      event.putString("color", annotationColor);

      WritableMap rect = Arguments.createMap();
      rect.putDouble("x", nx);
      rect.putDouble("y", ny);
      rect.putDouble("width", 0.05);
      rect.putDouble("height", 0.02);
      event.putMap("rect", rect);

      event.putString("content", "");
      event.putDouble("createdAt", System.currentTimeMillis());

      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onAnnotationCreated", event);
    } catch (Throwable ignored) {
    }
  }

  private Annotation findAnnotationAt(int pageIndex, float nx, float ny) {
    for (Annotation annotation : annotations) {
      if (annotation.pageIndex != pageIndex) continue;
      if (annotation.rects == null || annotation.rects.isEmpty()) continue;
      for (NormalizedRect rect : annotation.rects) {
        if (nx >= rect.x && nx <= rect.x + rect.width &&
            ny >= rect.y && ny <= rect.y + rect.height) {
          return annotation;
        }
      }
    }
    return null;
  }

  private void emitAnnotationTap(Annotation annotation) {
    try {
      WritableMap event = Arguments.createMap();
      event.putString("id", annotation.id);
      event.putInt("pageIndex", annotation.pageIndex);
      event.putString("type", annotation.type);
      event.putString("color", annotation.color);
      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onAnnotationTap", event);
    } catch (Throwable ignored) {
    }
  }

  private ScaleGestureDetector createScaleDetector(Context context) {
    return new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
      @Override
      public boolean onScaleBegin(ScaleGestureDetector detector) {
        wasScaling = true;
        return true;
      }

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
    final int generationAtStart = renderGeneration;
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
            lastPageBitmap.put(frame.index, finalRendered);
          }
          if (generationAtStart == renderGeneration) {
            invalidate();
          }
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

  private final Paint overlayPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private List<SearchResult> searchResults = new ArrayList<>();
  private List<Annotation> annotations = new ArrayList<>();

  public void setSearchResults(List<SearchResult> results) {
    searchResults = results != null ? results : new ArrayList<>();
    invalidate();
  }

  public void setAnnotations(List<Annotation> items) {
    annotations = items != null ? items : new ArrayList<>();
    invalidate();
  }

  private void drawOverlays(Canvas canvas, PageFrame frame, int left, int top) {
    float scaleX = frame.width;
    float scaleY = frame.height;

    for (SearchResult result : searchResults) {
      if (result.pageIndex != frame.index) continue;
      overlayPaint.setColor(Color.argb(128, 255, 220, 50));
      for (NormalizedRect rect : result.rects) {
        float rLeft = left + rect.x * scaleX;
        float rTop = top + rect.y * scaleY;
        float rRight = rLeft + rect.width * scaleX;
        float rBottom = rTop + rect.height * scaleY;
        canvas.drawRect(rLeft, rTop, rRight, rBottom, overlayPaint);
      }
    }

    for (Annotation annotation : annotations) {
      if (annotation.pageIndex != frame.index) continue;
      int color = parseColor(annotation.color, Color.YELLOW);
      if ("ink".equals(annotation.type) && annotation.path != null && annotation.path.size() >= 2) {
        overlayPaint.setColor(color);
        overlayPaint.setAlpha(Math.round(annotation.opacity * 255));
        overlayPaint.setStyle(Paint.Style.STROKE);
        overlayPaint.setStrokeCap(Paint.Cap.ROUND);
        overlayPaint.setStrokeJoin(Paint.Join.ROUND);
        float minScale = Math.min(scaleX, scaleY);
        overlayPaint.setStrokeWidth(annotation.strokeWidth * minScale);
        Path inkPath = new Path();
        boolean first = true;
        for (NormalizedPoint p : annotation.path) {
          float px = left + p.x * scaleX;
          float py = top + p.y * scaleY;
          if (first) {
            inkPath.moveTo(px, py);
            first = false;
          } else {
            inkPath.lineTo(px, py);
          }
        }
        canvas.drawPath(inkPath, overlayPaint);
        overlayPaint.setAlpha(255);
        overlayPaint.setStyle(Paint.Style.FILL);
        continue;
      }
      overlayPaint.setColor(Color.argb(140, Color.red(color), Color.green(color), Color.blue(color)));
      for (NormalizedRect rect : annotation.rects) {
        float rLeft = left + rect.x * scaleX;
        float rTop = top + rect.y * scaleY;
        float rRight = rLeft + rect.width * scaleX;
        float rBottom = rTop + rect.height * scaleY;
        if ("underline".equals(annotation.type)) {
          canvas.drawLine(rLeft, rBottom - 2, rRight, rBottom - 2, overlayPaint);
        } else if ("strikeout".equals(annotation.type)) {
          canvas.drawLine(rLeft, (rTop + rBottom) / 2f, rRight, (rTop + rBottom) / 2f, overlayPaint);
        } else {
          canvas.drawRect(rLeft, rTop, rRight, rBottom, overlayPaint);
        }
      }
    }

    if (isDrawingInk && inkStrokePageIndex == frame.index && inkStrokePoints.size() >= 2) {
      overlayPaint.setColor(parseColor(annotationColor, Color.BLACK));
      overlayPaint.setAlpha(Math.round(annotationOpacity * 255));
      overlayPaint.setStyle(Paint.Style.STROKE);
      overlayPaint.setStrokeCap(Paint.Cap.ROUND);
      overlayPaint.setStrokeJoin(Paint.Join.ROUND);
      float minScale = Math.min(scaleX, scaleY);
      overlayPaint.setStrokeWidth(inkStrokeWidth * minScale);
      Path activePath = new Path();
      boolean first = true;
      for (float[] p : inkStrokePoints) {
        float px = left + p[0] * scaleX;
        float py = top + p[1] * scaleY;
        if (first) {
          activePath.moveTo(px, py);
          first = false;
        } else {
          activePath.lineTo(px, py);
        }
      }
      canvas.drawPath(activePath, overlayPaint);
      overlayPaint.setAlpha(255);
      overlayPaint.setStyle(Paint.Style.FILL);
    }
  }

  private static int parseColor(String colorString, int fallback) {
    try {
      return Color.parseColor(colorString);
    } catch (IllegalArgumentException ignored) {
      return fallback;
    }
  }

  static final class NormalizedRect {
    final float x, y, width, height;
    NormalizedRect(float x, float y, float width, float height) {
      this.x = x; this.y = y; this.width = width; this.height = height;
    }
  }

  static final class SearchResult {
    final int pageIndex;
    final List<NormalizedRect> rects;
    SearchResult(int pageIndex, List<NormalizedRect> rects) {
      this.pageIndex = pageIndex;
      this.rects = rects;
    }
  }

  static final class Annotation {
    final String id;
    final int pageIndex;
    final String type;
    final String color;
    final List<NormalizedRect> rects;
    final List<NormalizedPoint> path;
    final float strokeWidth;
    final float opacity;
    Annotation(String id, int pageIndex, String type, String color, List<NormalizedRect> rects) {
      this(id, pageIndex, type, color, rects, null, 0.006f, 0.85f);
    }
    Annotation(String id, int pageIndex, String type, String color, List<NormalizedRect> rects, List<NormalizedPoint> path, float strokeWidth, float opacity) {
      this.id = id;
      this.pageIndex = pageIndex;
      this.type = type;
      this.color = color;
      this.rects = rects;
      this.path = path;
      this.strokeWidth = strokeWidth;
      this.opacity = opacity;
    }
  }

  static final class NormalizedPoint {
    final float x, y;
    NormalizedPoint(float x, float y) {
      this.x = x; this.y = y;
    }
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
