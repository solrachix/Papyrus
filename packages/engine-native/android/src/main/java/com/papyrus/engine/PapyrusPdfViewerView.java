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
import android.os.SystemClock;
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
      // Do not recycle here to avoid flickering when a bitmap is evicted
      // while it may still be referenced by lastPageBitmap or drawn on screen.
      // On Android 8.0+ (API 26+), Bitmap pixel data lives in native heap
      // and is garbage-collected normally without explicit recycle().
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
  private String viewMode = "continuous";
  private float offsetX = 0f;
  private float offsetY = 0f;
  private float contentWidth = 0f;
  private float contentHeight = 0f;
  private float lastTouchX = 0f;
  private float lastTouchY = 0f;
  private boolean layoutDirty = true;
  private int renderGeneration = 0;
  private boolean isDrawingInk = false;
  private boolean isPinching = false;
  private float pinchScale = 1.0f;
  private float pinchFocusX = 0f;
  private float pinchFocusY = 0f;
  private float pinchStartZoom = 1.0f;
  private float pinchStartOffsetX = 0f;
  private float pinchStartOffsetY = 0f;
  private float pinchStartFocusX = 0f;
  private float pinchStartFocusY = 0f;

  // Viewport anchor for stable zoom around the focused page
  private static class ViewportAnchor {
    final int pageIndex;
    final float pageXRatio;
    final float pageYRatio;
    final float screenX;
    final float screenY;

    ViewportAnchor(int pageIndex, float pageXRatio, float pageYRatio, float screenX, float screenY) {
      this.pageIndex = pageIndex;
      this.pageXRatio = pageXRatio;
      this.pageYRatio = pageYRatio;
      this.screenX = screenX;
      this.screenY = screenY;
    }
  }

  private List<float[]> inkStrokePoints = new ArrayList<>();
  private int inkStrokePageIndex = -1;
  private long touchDownTime = 0;
  private float touchDownX = 0;
  private float touchDownY = 0;
  private static final long TAP_MAX_DURATION_MS = 300;
  private static final float TAP_MAX_DISTANCE_DP = 12;

  // Text selection state
  private boolean isSelectingText = false;
  private int selectPageIndex = -1;
  private float selectStartX = 0;
  private float selectStartY = 0;
  private float selectEndX = 0;
  private float selectEndY = 0;
  private String selectedText = "";
  private List<NormalizedRect> selectedRects = new ArrayList<>();
  private final ExecutorService SELECT_EXECUTOR = Executors.newSingleThreadExecutor();
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  // Double-tap detection for text selection
  private long lastTapTime = 0;
  private float lastTapX = 0;
  private float lastTapY = 0;
  private static final long DOUBLE_TAP_MAX_DELTA_MS = 250;
  private static final float DOUBLE_TAP_MAX_DISTANCE_DP = 20;
  private Runnable pendingSingleTap;

  // Long-press detection
  private static final long LONG_PRESS_MS = 450;
  private Runnable pendingLongPress;
  private boolean longPressFired = false;

  // Selection handles
  private static final float HANDLE_RADIUS_DP = 10;
  private static final int HANDLE_COLOR = Color.parseColor("#4285F4");
  private int draggedHandle = 0; // 0 = none, -1 = start handle, 1 = end handle

  private final ReactContext reactContext;
  private final Handler eventThrottleHandler = new Handler(Looper.getMainLooper());
  private Runnable pendingZoomEvent;
  private Runnable pendingScrollEvent;

  // Visible pages deduplication to prevent JS/native loop in page gaps
  private String lastVisiblePagesSignature = "";
  private int lastStablePage = 1;
  private static final float MIN_VISIBLE_RATIO = 0.03f;
  private static final float VISIBLE_RATIO_BUCKET = 0.02f;
  private static final float CURRENT_PAGE_SWITCH_THRESHOLD = 0.08f;
  private static final boolean DEBUG_GAP = false;
  private static final boolean DEBUG_RENDER_GAP = false;
  private static final boolean ISOLATE_RENDER_TEST = false;
  private static final long RENDER_COOLDOWN_MS = 250;
  private static final float MIN_VISIBLE_PX = 16f;
  private final Map<String, Long> renderRequestCooldown = new HashMap<>();

  private final OverScroller flingScroller;
  private VelocityTracker velocityTracker;
  private final Runnable flingRunnable = new Runnable() {
    @Override
    public void run() {
      if (flingScroller.computeScrollOffset()) {
        offsetX = flingScroller.getCurrX();
        offsetY = flingScroller.getCurrY();
        clampOffsets();
        emitScrollEvent(offsetY);
        invalidate();
        postOnAnimation(this);
      } else {
        int visiblePage = computeVisiblePage();
        if (visiblePage > 0) {
          emitPageChanged(visiblePage);
        }
        if ("single".equals(viewMode) && visiblePage > 0) {
          snapToPage(visiblePage - 1);
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
    if (isSelectingText || !selectedRects.isEmpty()) {
      isSelectingText = false;
      selectPageIndex = -1;
      selectedRects.clear();
      selectedText = "";
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

  public void setViewMode(String mode) {
    String normalized = mode == null ? "continuous" : mode;
    if (normalized.equals(viewMode)) return;
    viewMode = normalized;
    if ("single".equals(viewMode)) {
      ensureLayout();
      snapToPage(computeVisiblePage() - 1);
    }
    invalidate();
  }

  public void setSelectionActive(boolean active) {
    if (active) return;
    if (isSelectingText || !selectedRects.isEmpty()) {
      isSelectingText = false;
      selectPageIndex = -1;
      selectStartX = 0;
      selectStartY = 0;
      selectEndX = 0;
      selectEndY = 0;
      selectedRects.clear();
      selectedText = "";
      draggedHandle = 0;
      invalidate();
    }
  }

  private long extractNativeDocPointer(PdfDocument document) {
    try {
      java.lang.reflect.Field field = PdfDocument.class.getDeclaredField("mNativeDocPtr");
      field.setAccessible(true);
      Object value = field.get(document);
      if (value instanceof Long) {
        return (Long) value;
      }
    } catch (Throwable ignored) {
    }
    return 0;
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

    if (event.getPointerCount() > 1) {
      // Cancel any pending text selection when a second finger touches
      if (pendingLongPress != null) {
        mainHandler.removeCallbacks(pendingLongPress);
        pendingLongPress = null;
      }
    }

    if ("ink".equals(activeTool) && event.getPointerCount() == 1) {
      return handleInkTouch(event);
    }

    if (("text".equals(activeTool) || "comment".equals(activeTool)) && event.getPointerCount() == 1) {
      return handleTextCommentTouch(event);
    }

    if ("select".equals(activeTool) && event.getPointerCount() == 1) {
      boolean consumed = handleSelectTouch(event);
      if (consumed) return true;
      // Not consumed: let React Native handle the touch (e.g. toolbar buttons)
      return false;
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
          emitScrollEvent(offsetY);
          invalidate();
        }
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        return true;
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        if (!scaleDetector.isInProgress() && velocityTracker != null) {
          velocityTracker.addMovement(event);
          velocityTracker.computeCurrentVelocity(1000, 8000);
          float velocityX = velocityTracker.getXVelocity();
          float velocityY = velocityTracker.getYVelocity();
          if (Math.abs(velocityX) > 200 || Math.abs(velocityY) > 200) {
            if ("single".equals(viewMode)) {
              int currentPage = computeVisiblePage() - 1;
              int targetPage = currentPage;
              if (velocityY > 400 && currentPage > 0) {
                targetPage = currentPage - 1;
              } else if (velocityY < -400 && currentPage < pageFrames.size() - 1) {
                targetPage = currentPage + 1;
              }
              snapToPage(targetPage);
            } else {
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
            }
          } else {
            int visiblePage = computeVisiblePage();
            if (visiblePage > 0) {
              emitPageChanged(visiblePage);
            }
            if ("single".equals(viewMode) && visiblePage > 0) {
              snapToPage(visiblePage - 1);
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
            // Single mode tap zones: left half = prev page, right half = next page
            if ("single".equals(viewMode) && !pageFrames.isEmpty()) {
              int currentPage = computeVisiblePage() - 1;
              if (event.getX() < getWidth() / 2f) {
                if (currentPage > 0) snapToPage(currentPage - 1);
              } else {
                if (currentPage < pageFrames.size() - 1) snapToPage(currentPage + 1);
              }
              return true;
            }
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

  private boolean handleSelectTouch(MotionEvent event) {
    float density = getResources().getDisplayMetrics().density;
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        if (event.getPointerCount() > 1) {
          return true; // Multi-touch: ignore, let pinch zoom handle it
        }
        touchDownTime = System.currentTimeMillis();
        touchDownX = event.getX();
        touchDownY = event.getY();
        longPressFired = false;
        draggedHandle = 0;

        // Check if touching a selection handle
        if (isSelectingText && selectPageIndex >= 0 && !selectedRects.isEmpty()) {
          int handleHit = hitTestHandle(event.getX(), event.getY(), density);
          if (handleHit != 0) {
            draggedHandle = handleHit;
            if (velocityTracker != null) {
              velocityTracker.recycle();
              velocityTracker = null;
            }
            return true;
          }
          // If selection is active and touch is NOT on a handle, check if it's on the selection
          if (!hitTestSelection(event.getX(), event.getY())) {
            // Touch outside selection area: let React Native handle it (toolbar buttons)
            return false;
          }
        }

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

        // Start long-press timer
        pendingLongPress = () -> {
          pendingLongPress = null;
          longPressFired = true;
          // Long press: select word at this point
          ensureLayout();
          float docX = touchDownX + offsetX;
          float docY = touchDownY + offsetY;
          int pageIdx = findPageIndexAt(docX, docY);
          if (pageIdx >= 0) {
            PageFrame frame = pageFrames.get(pageIdx);
            float nx = clamp01((docX - frame.left) / frame.width);
            float ny = clamp01((docY - frame.top) / frame.height);
            isSelectingText = true;
            selectPageIndex = pageIdx;
            selectStartX = nx;
            selectStartY = ny;
            selectEndX = nx;
            selectEndY = ny;
            performWordSelection();
          }
        };
        mainHandler.postDelayed(pendingLongPress, LONG_PRESS_MS);
        return true;

      case MotionEvent.ACTION_MOVE:
        if (pendingLongPress != null) {
          float cancelDx = event.getX() - touchDownX;
          float cancelDy = event.getY() - touchDownY;
          if (Math.hypot(cancelDx, cancelDy) > TAP_MAX_DISTANCE_DP * density) {
            mainHandler.removeCallbacks(pendingLongPress);
            pendingLongPress = null;
          }
        }

        if (draggedHandle != 0 && isSelectingText && selectPageIndex >= 0) {
          ensureLayout();
          float moveDocX = event.getX() + offsetX;
          float moveDocY = event.getY() + offsetY;
          PageFrame moveFrame = null;
          for (PageFrame f : pageFrames) {
            if (f.index == selectPageIndex) {
              moveFrame = f;
              break;
            }
          }
          if (moveFrame != null) {
            float nx = clamp01((moveDocX - moveFrame.left) / moveFrame.width);
            float ny = clamp01((moveDocY - moveFrame.top) / moveFrame.height);
            // Line-based selection: when dragging vertically across lines,
            // snap X to page edge so the entire line gets selected
            float lineHeight = 0.025f;
            if (draggedHandle < 0) {
              // Start handle: if moved to a different line than the end, snap to left edge
              if (Math.abs(ny - selectEndY) > lineHeight * 0.6f) {
                selectStartX = 0f;
              } else {
                selectStartX = nx;
              }
              selectStartY = ny;
            } else {
              // End handle: if moved to a different line than the start, snap to right edge
              if (Math.abs(ny - selectStartY) > lineHeight * 0.6f) {
                selectEndX = 1f;
              } else {
                selectEndX = nx;
              }
              selectEndY = ny;
            }
            performTextSelection();
          }
          return true;
        }

        if (velocityTracker != null) {
          velocityTracker.addMovement(event);
        }
        float moveDx = event.getX() - touchDownX;
        float moveDy = event.getY() - touchDownY;
        float moveDistance = (float) Math.hypot(moveDx, moveDy);
        if (!isSelectingText && moveDistance > TAP_MAX_DISTANCE_DP * density) {
          if (!scaleDetector.isInProgress() && event.getPointerCount() == 1) {
            offsetX += lastTouchX - event.getX();
            offsetY += lastTouchY - event.getY();
            clampOffsets();
            emitScrollEvent(offsetY);
            invalidate();
          }
          lastTouchX = event.getX();
          lastTouchY = event.getY();
          return true;
        }
        if (isSelectingText && selectPageIndex >= 0) {
          ensureLayout();
          float moveDocX = event.getX() + offsetX;
          float moveDocY = event.getY() + offsetY;
          PageFrame moveFrame = null;
          for (PageFrame f : pageFrames) {
            if (f.index == selectPageIndex) {
              moveFrame = f;
              break;
            }
          }
          if (moveFrame != null) {
            float nx = clamp01((moveDocX - moveFrame.left) / moveFrame.width);
            float ny = clamp01((moveDocY - moveFrame.top) / moveFrame.height);
            // Line-based selection: snap to page edge when crossing lines
            float lineHeight = 0.025f;
            if (Math.abs(ny - selectStartY) > lineHeight * 0.6f) {
              selectEndX = 1f;
            } else {
              selectEndX = nx;
            }
            selectEndY = ny;
            performTextSelection();
          }
        }
        lastTouchX = event.getX();
        lastTouchY = event.getY();
        return true;

      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        if (pendingLongPress != null) {
          mainHandler.removeCallbacks(pendingLongPress);
          pendingLongPress = null;
        }

        draggedHandle = 0;

        if (!scaleDetector.isInProgress() && velocityTracker != null) {
          velocityTracker.addMovement(event);
          velocityTracker.computeCurrentVelocity(1000, 8000);
          float velocityX = velocityTracker.getXVelocity();
          float velocityY = velocityTracker.getYVelocity();
          if (Math.abs(velocityX) > 200 || Math.abs(velocityY) > 200) {
            if ("single".equals(viewMode)) {
              int currentPage = computeVisiblePage() - 1;
              int targetPage = currentPage;
              if (velocityY > 400 && currentPage > 0) {
                targetPage = currentPage - 1;
              } else if (velocityY < -400 && currentPage < pageFrames.size() - 1) {
                targetPage = currentPage + 1;
              }
              snapToPage(targetPage);
            } else {
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
            }
          } else if ("single".equals(viewMode)) {
            int visiblePage = computeVisiblePage();
            if (visiblePage > 0) {
              snapToPage(visiblePage - 1);
            }
          }
          velocityTracker.recycle();
          velocityTracker = null;
        }

        long duration = System.currentTimeMillis() - touchDownTime;
        float upDx = event.getX() - touchDownX;
        float upDy = event.getY() - touchDownY;
        float upDistance = (float) Math.hypot(upDx, upDy);

        if (longPressFired || duration > TAP_MAX_DURATION_MS || upDistance > TAP_MAX_DISTANCE_DP * density) {
          if (isSelectingText && !longPressFired) {
            emitTextSelected();
          }
          return true;
        }

        long now = System.currentTimeMillis();
        float tapDx = event.getX() - lastTapX;
        float tapDy = event.getY() - lastTapY;
        float tapDistance = (float) Math.hypot(tapDx, tapDy);
        boolean isDoubleTap = (now - lastTapTime) < DOUBLE_TAP_MAX_DELTA_MS && tapDistance < DOUBLE_TAP_MAX_DISTANCE_DP * density;

        if (pendingSingleTap != null) {
          mainHandler.removeCallbacks(pendingSingleTap);
          pendingSingleTap = null;
        }

        if (isDoubleTap) {
          lastTapTime = 0;
          ensureLayout();
          float docX = event.getX() + offsetX;
          float docY = event.getY() + offsetY;
          int pageIdx = findPageIndexAt(docX, docY);
          if (pageIdx >= 0) {
            PageFrame frame = pageFrames.get(pageIdx);
            float nx = clamp01((docX - frame.left) / frame.width);
            float ny = clamp01((docY - frame.top) / frame.height);
            isSelectingText = true;
            selectPageIndex = pageIdx;
            selectStartX = nx;
            selectStartY = ny;
            selectEndX = nx;
            selectEndY = ny;
            performTextSelection();
          }
        } else {
          lastTapTime = now;
          lastTapX = event.getX();
          lastTapY = event.getY();
          pendingSingleTap = () -> {
            pendingSingleTap = null;
            if (isSelectingText) {
              isSelectingText = false;
              selectPageIndex = -1;
              selectedRects.clear();
              selectedText = "";
              invalidate();
            }
          };
          mainHandler.postDelayed(pendingSingleTap, DOUBLE_TAP_MAX_DELTA_MS + 50);
        }
        return true;
      default:
        return true;
    }
  }

  private boolean hitTestSelection(float screenX, float screenY) {
    if (!isSelectingText || selectPageIndex < 0 || selectedRects.isEmpty()) return false;
    PageFrame frame = null;
    for (PageFrame f : pageFrames) {
      if (f.index == selectPageIndex) {
        frame = f;
        break;
      }
    }
    if (frame == null) return false;

    float nx = clamp01((screenX + offsetX - frame.left) / frame.width);
    float ny = clamp01((screenY + offsetY - frame.top) / frame.height);

    // Check if point is inside any selected rect
    for (NormalizedRect rect : selectedRects) {
      if (nx >= rect.x && nx <= rect.x + rect.width &&
          ny >= rect.y && ny <= rect.y + rect.height) {
        return true;
      }
    }
    return false;
  }

  private int hitTestHandle(float screenX, float screenY, float density) {
    if (selectedRects.isEmpty() || selectPageIndex < 0) return 0;
    PageFrame frame = null;
    for (PageFrame f : pageFrames) {
      if (f.index == selectPageIndex) {
        frame = f;
        break;
      }
    }
    if (frame == null) return 0;

    float radius = HANDLE_RADIUS_DP * density * 1.8f;

    // Start handle: top-left of first rect
    NormalizedRect first = selectedRects.get(0);
    float startX = Math.round(frame.left - offsetX + first.x * frame.width);
    float startY = Math.round(frame.top - offsetY + first.y * frame.height);
    if (Math.hypot(screenX - startX, screenY - startY) < radius) return -1;

    // End handle: bottom-right of last rect
    NormalizedRect last = selectedRects.get(selectedRects.size() - 1);
    float endX = Math.round(frame.left - offsetX + (last.x + last.width) * frame.width);
    float endY = Math.round(frame.top - offsetY + (last.y + last.height) * frame.height);
    if (Math.hypot(screenX - endX, screenY - endY) < radius) return 1;

    return 0;
  }

  private void performWordSelection() {
    if (selectPageIndex < 0) return;
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null) return;
    if (!PapyrusTextSelect.AVAILABLE) return;

    // Use a larger rect to capture the whole word
    float wordW = 0.05f;
    float wordH = 0.03f;
    float minX = Math.max(0f, selectStartX - wordW / 2f);
    float minY = Math.max(0f, selectStartY - wordH / 2f);
    float maxX = Math.min(1f, selectStartX + wordW / 2f);
    float maxY = Math.min(1f, selectStartY + wordH / 2f);

    final int pageIdx = selectPageIndex;
    final float selX = minX;
    final float selY = minY;
    final float selW = Math.max(0.001f, maxX - minX);
    final float selH = Math.max(0.001f, maxY - minY);

    final String sourcePath = state.sourcePath;
    SELECT_EXECUTOR.execute(() -> {
      PapyrusTextSelection selection = null;
      try {
        if (sourcePath != null && !sourcePath.isEmpty()) {
          synchronized (state.pdfiumLock) {
            selection = PapyrusTextSelect.nativeSelectTextFile(sourcePath, pageIdx, selX, selY, selW, selH);
          }
        } else {
          long docPtr;
          synchronized (state.pdfiumLock) {
            docPtr = extractNativeDocPointer(state.document);
          }
          if (docPtr != 0) {
            synchronized (state.pdfiumLock) {
              selection = PapyrusTextSelect.nativeSelectText(docPtr, pageIdx, selX, selY, selW, selH);
            }
          }
        }
      } catch (Throwable ignored) {
      }

      final PapyrusTextSelection finalSelection = selection;
      mainHandler.post(() -> {
        if (!isSelectingText && selectPageIndex != pageIdx) return;
        selectedRects.clear();
        if (finalSelection != null && finalSelection.rects != null && finalSelection.rects.length >= 4) {
          selectedText = finalSelection.text != null ? finalSelection.text : "";
          for (int i = 0; i + 3 < finalSelection.rects.length; i += 4) {
            selectedRects.add(new NormalizedRect(
              finalSelection.rects[i],
              finalSelection.rects[i + 1],
              finalSelection.rects[i + 2],
              finalSelection.rects[i + 3]
            ));
          }
          // Set selection bounds to cover the word
          if (!selectedRects.isEmpty()) {
            float sx = selectedRects.get(0).x;
            float sy = selectedRects.get(0).y;
            float ex = selectedRects.get(selectedRects.size() - 1).x + selectedRects.get(selectedRects.size() - 1).width;
            float ey = selectedRects.get(selectedRects.size() - 1).y + selectedRects.get(selectedRects.size() - 1).height;
            selectStartX = sx;
            selectStartY = sy;
            selectEndX = ex;
            selectEndY = ey;
          }
        } else {
          selectedText = "";
        }
        invalidate();
      });
    });
  }

  private void performTextSelection() {
    if (selectPageIndex < 0) return;
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null) return;
    if (!PapyrusTextSelect.AVAILABLE) return;

    float minX = Math.min(selectStartX, selectEndX);
    float minY = Math.min(selectStartY, selectEndY);
    float maxX = Math.max(selectStartX, selectEndX);
    float maxY = Math.max(selectStartY, selectEndY);
    float width = Math.max(0.001f, maxX - minX);
    float height = Math.max(0.001f, maxY - minY);

    final int pageIdx = selectPageIndex;
    final float selX = minX;
    final float selY = minY;
    final float selW = width;
    final float selH = height;

    final String sourcePath = state.sourcePath;
    SELECT_EXECUTOR.execute(() -> {
      PapyrusTextSelection selection = null;
      try {
        if (sourcePath != null && !sourcePath.isEmpty()) {
          synchronized (state.pdfiumLock) {
            selection = PapyrusTextSelect.nativeSelectTextFile(sourcePath, pageIdx, selX, selY, selW, selH);
          }
        } else {
          long docPtr;
          synchronized (state.pdfiumLock) {
            docPtr = extractNativeDocPointer(state.document);
          }
          if (docPtr != 0) {
            synchronized (state.pdfiumLock) {
              selection = PapyrusTextSelect.nativeSelectText(docPtr, pageIdx, selX, selY, selW, selH);
            }
          }
        }
      } catch (Throwable ignored) {
      }

      final PapyrusTextSelection finalSelection = selection;
      mainHandler.post(() -> {
        if (!isSelectingText && selectPageIndex != pageIdx) return;
        selectedRects.clear();
        if (finalSelection != null && finalSelection.rects != null && finalSelection.rects.length >= 4) {
          selectedText = finalSelection.text != null ? finalSelection.text : "";
          for (int i = 0; i + 3 < finalSelection.rects.length; i += 4) {
            selectedRects.add(new NormalizedRect(
              finalSelection.rects[i],
              finalSelection.rects[i + 1],
              finalSelection.rects[i + 2],
              finalSelection.rects[i + 3]
            ));
          }
        } else {
          selectedText = "";
        }
        invalidate();
      });
    });
  }

  private void emitTextSelected() {
    try {
      if (selectedRects.isEmpty()) return;
      WritableMap event = Arguments.createMap();
      event.putString("text", selectedText);
      event.putInt("pageIndex", selectPageIndex);
      WritableArray rects = Arguments.createArray();
      for (NormalizedRect rect : selectedRects) {
        WritableMap r = Arguments.createMap();
        r.putDouble("x", rect.x);
        r.putDouble("y", rect.y);
        r.putDouble("width", rect.width);
        r.putDouble("height", rect.height);
        rects.pushMap(r);
      }
      event.putArray("rects", rects);
      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onTextSelected", event);
    } catch (Throwable ignored) {
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
    if (!isPinching) {
      ensureLayout();
    }
    canvas.drawColor(resolveBackgroundColor(pageTheme));
    if (pageFrames.isEmpty()) return;

    if (isPinching) {
      canvas.save();
      canvas.translate(pinchFocusX, pinchFocusY);
      canvas.scale(pinchScale, pinchScale);
      canvas.translate(-pinchFocusX, -pinchFocusY);
    }

    boolean inGap = isViewportCenterInsidePageGap();
    int visibleCount = 0;

    for (PageFrame frame : pageFrames) {
      int left = Math.round(frame.left - offsetX);
      int top = Math.round(frame.top - offsetY);
      int right = Math.round(left + frame.width);
      int bottom = Math.round(top + frame.height);
      if (bottom < 0 || top > getHeight()) continue;

      float visibleTop = Math.max(frame.top, offsetY);
      float visibleBottom = Math.min(frame.top + frame.height, offsetY + getHeight());
      float visibleHeight = visibleBottom - visibleTop;
      boolean meaningfullyVisible = visibleHeight >= MIN_VISIBLE_PX;
      if (visibleHeight > 0) visibleCount++;

      paint.setColor(resolvePageColor(pageTheme));
      paint.setColorFilter(null);
      canvas.drawRect(left, top, right, bottom, paint);

      String key = buildRenderKey(frame);
      Bitmap bitmap = RENDER_CACHE.get(key);
      boolean drawn = false;
      if (bitmap != null && !bitmap.isRecycled()) {
        try {
          paint.setColorFilter(resolveThemeFilter(pageTheme));
          canvas.drawBitmap(bitmap, null, new Rect(left, top, right, bottom), paint);
          paint.setColorFilter(null);
          drawn = true;
        } catch (RuntimeException error) {
          Log.w(TAG, "Failed to draw dedicated PDF page", error);
        }
      }

      if (!drawn) {
        Bitmap fallback = lastPageBitmap.get(frame.index);
        if (fallback != null && !fallback.isRecycled()) {
          try {
            paint.setColorFilter(resolveThemeFilter(pageTheme));
            canvas.drawBitmap(fallback, null, new Rect(left, top, right, bottom), paint);
            paint.setColorFilter(null);
            drawn = true;
          } catch (RuntimeException error) {
            Log.w(TAG, "Failed to draw fallback PDF page", error);
          }
        }
      }

      if (!drawn && !isPinching) {
        if (!meaningfullyVisible) {
          if (DEBUG_RENDER_GAP) {
            Log.d(TAG, "onDraw: skip render page=" + frame.index + " visibleHeight=" + visibleHeight + " below threshold");
          }
        } else if (inGap && frame.index + 1 != lastStablePage) {
          if (DEBUG_RENDER_GAP) {
            Log.d(TAG, "onDraw: skip render page=" + frame.index + " inGap lastStablePage=" + lastStablePage);
          }
        } else {
          if (DEBUG_RENDER_GAP) {
            Log.d(TAG, "onDraw: requestRender page=" + frame.index + " key=" + key + " zoom=" + zoom + " offsetY=" + offsetY);
          }
          requestRender(frame, key);
        }
      }

      drawOverlays(canvas, frame, left, top);
    }

    if (DEBUG_RENDER_GAP) {
      Log.d(TAG, "onDraw: visibleCount=" + visibleCount + " inGap=" + inGap + " zoom=" + zoom + " offsetY=" + offsetY + " lastStablePage=" + lastStablePage);
    }
    if (isPinching) {
      canvas.restore();
    }
  }

  private boolean isViewportCenterInsidePageGap() {
    if (pageFrames.isEmpty() || getHeight() <= 0) return false;
    float centerY = offsetY + getHeight() / 2f;
    for (PageFrame frame : pageFrames) {
      if (centerY >= frame.top && centerY <= frame.top + frame.height) {
        return false;
      }
    }
    return true;
  }

  private float getVisibleRatioThreshold() {
    return zoom >= 2.0f ? 0.08f : MIN_VISIBLE_RATIO;
  }

  private int computeVisiblePage() {
    if (pageFrames.isEmpty() || getHeight() <= 0) return Math.max(1, lastStablePage);

    // If viewport center is inside a page gap, keep the last stable page
    if (isViewportCenterInsidePageGap()) {
      if (DEBUG_GAP) {
        Log.d(TAG, "computeVisiblePage: center in gap, keeping lastStablePage=" + lastStablePage);
      }
      return Math.max(1, lastStablePage);
    }

    float viewportTop = offsetY;
    float viewportBottom = offsetY + getHeight();

    int bestPage = -1;
    float bestRatio = 0f;

    for (PageFrame frame : pageFrames) {
      float frameTop = frame.top;
      float frameBottom = frame.top + frame.height;
      float visibleTop = Math.max(frameTop, viewportTop);
      float visibleBottom = Math.min(frameBottom, viewportBottom);
      float visibleHeight = visibleBottom - visibleTop;

      if (visibleHeight <= 0f || frame.height <= 0f) continue;

      float ratio = visibleHeight / frame.height;

      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestPage = frame.index + 1;
      }
    }

    // If we're essentially in a gap (no dominant page), keep the last stable page
    if (bestPage < 0 || bestRatio < CURRENT_PAGE_SWITCH_THRESHOLD) {
      return Math.max(1, lastStablePage);
    }

    lastStablePage = bestPage;
    return bestPage;
  }

  private void emitPageChanged(int page) {
    if (ISOLATE_RENDER_TEST) return;
    if (isPinching) return;
    try {
      WritableMap event = Arguments.createMap();
      event.putInt("page", page);
      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onPageChanged", event);

      WritableMap aliasEvent = Arguments.createMap();
      aliasEvent.putInt("page", page);
      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onPageChange", aliasEvent);
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

        WritableMap aliasEvent = Arguments.createMap();
        aliasEvent.putDouble("zoom", zoomValue);
        reactContext.getJSModule(RCTEventEmitter.class)
          .receiveEvent(getId(), "onZoomChange", aliasEvent);
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
        isPinching = true;
        pinchScale = 1.0f;
        pinchStartZoom = zoom;
        pinchStartOffsetX = offsetX;
        pinchStartOffsetY = offsetY;
        pinchFocusX = detector.getFocusX();
        pinchFocusY = detector.getFocusY();
        return true;
      }

      @Override
      public boolean onScale(ScaleGestureDetector detector) {
        float scaleFactor = detector.getScaleFactor();
        float focusX = detector.getFocusX();
        float focusY = detector.getFocusY();

        pinchScale = clamp(
          pinchScale * scaleFactor,
          0.5f / Math.max(pinchStartZoom, 0.5f),
          5.0f / Math.max(pinchStartZoom, 0.5f)
        );
        pinchFocusX = focusX;
        pinchFocusY = focusY;
        invalidate();
        return true;
      }

      @Override
      public void onScaleEnd(ScaleGestureDetector detector) {
        ViewportAnchor anchor = captureViewportAnchor(pinchFocusX, pinchFocusY);
        float finalZoom = clamp(pinchStartZoom * pinchScale, 0.5f, 5.0f);

        isPinching = false;
        pinchScale = 1.0f;
        zoom = finalZoom;
        renderGeneration += 1;
        layoutDirty = true;
        ensureLayout();
        restoreViewportAnchor(anchor);

        invalidate();
        emitZoomChanged(zoom);
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
        float maxWidth = getWidth();
        int availableWidth = Math.max(1, getWidth() - PAGE_PADDING * 2);

        if ("single".equals(viewMode)) {
          float cellHeight = getHeight();
          for (int i = 0; i < pageCount; i += 1) {
            state.pdfium.openPage(document, i);
            int pageWidth = Math.max(1, state.pdfium.getPageWidthPoint(document, i));
            int pageHeight = Math.max(1, state.pdfium.getPageHeightPoint(document, i));
            float baseScale = availableWidth / (float) pageWidth;
            float width = pageWidth * baseScale * zoom;
            float height = pageHeight * baseScale * zoom;
            maxWidth = Math.max(maxWidth, width + PAGE_PADDING * 2);
            float left = Math.max(PAGE_PADDING, (maxWidth - width) / 2f);
            float top = i * cellHeight + (cellHeight - height) / 2f;
            pageFrames.add(new PageFrame(i, left, top, width, height, pageWidth, pageHeight));
          }
          contentWidth = maxWidth;
          contentHeight = Math.max(getHeight(), pageCount * cellHeight);
        } else {
          float y = PAGE_PADDING;
          for (int i = 0; i < pageCount; i += 1) {
            state.pdfium.openPage(document, i);
            int pageWidth = Math.max(1, state.pdfium.getPageWidthPoint(document, i));
            int pageHeight = Math.max(1, state.pdfium.getPageHeightPoint(document, i));
            float baseScale = availableWidth / (float) pageWidth;
            float width = pageWidth * baseScale * zoom;
            float height = pageHeight * baseScale * zoom;
            maxWidth = Math.max(maxWidth, width + PAGE_PADDING * 2);
            float left = Math.max(PAGE_PADDING, (maxWidth - width) / 2f);
            pageFrames.add(new PageFrame(i, left, y, width, height, pageWidth, pageHeight));
            y += height + PAGE_GAP;
          }
          contentWidth = maxWidth;
          contentHeight = Math.max(getHeight(), y + PAGE_PADDING);
        }
      }
    } catch (Throwable error) {
      Log.w(TAG, "Failed to layout dedicated PDF viewer", error);
      contentWidth = getWidth();
      contentHeight = getHeight();
    }
    layoutDirty = false;
    clampOffsets();
  }

  private ViewportAnchor captureViewportAnchor(float screenX, float screenY) {
    if (pageFrames.isEmpty()) return null;

    float contentX = offsetX + screenX;
    float contentY = offsetY + screenY;

    PageFrame frame = findFrameForAnchor(contentY);

    if (frame == null) {
      int fallbackIndex = Math.max(0, Math.min(pageFrames.size() - 1, lastStablePage - 1));
      frame = pageFrames.get(fallbackIndex);
    }

    float xRatio = frame.width <= 0f
      ? 0f
      : clamp((contentX - frame.left) / frame.width, 0f, 1f);

    float yRatio = frame.height <= 0f
      ? 0f
      : clamp((contentY - frame.top) / frame.height, 0f, 1f);

    return new ViewportAnchor(frame.index, xRatio, yRatio, screenX, screenY);
  }

  private PageFrame findFrameForAnchor(float contentY) {
    PageFrame nearest = null;
    float nearestDistance = Float.MAX_VALUE;

    for (PageFrame frame : pageFrames) {
      float top = frame.top;
      float bottom = frame.top + frame.height;

      if (contentY >= top && contentY <= bottom) {
        return frame;
      }

      float distance = contentY < top ? top - contentY : contentY - bottom;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = frame;
      }
    }

    return nearest;
  }

  private void restoreViewportAnchor(ViewportAnchor anchor) {
    if (anchor == null) return;
    if (anchor.pageIndex < 0 || anchor.pageIndex >= pageFrames.size()) return;

    PageFrame frame = pageFrames.get(anchor.pageIndex);

    offsetX = frame.left + frame.width * anchor.pageXRatio - anchor.screenX;
    offsetY = frame.top + frame.height * anchor.pageYRatio - anchor.screenY;

    clampOffsets();
  }

  private void ensureLayoutLight() {
    if (pageFrames.isEmpty()) return;
    float maxWidth = getWidth();
    int availableWidth = Math.max(1, getWidth() - PAGE_PADDING * 2);

    if ("single".equals(viewMode)) {
      float cellHeight = getHeight();
      for (int i = 0; i < pageFrames.size(); i += 1) {
        PageFrame old = pageFrames.get(i);
        float baseScale = availableWidth / (float) old.pageWidth;
        float width = old.pageWidth * baseScale * zoom;
        float height = old.pageHeight * baseScale * zoom;
        maxWidth = Math.max(maxWidth, width + PAGE_PADDING * 2);
        float left = Math.max(PAGE_PADDING, (maxWidth - width) / 2f);
        float top = i * cellHeight + (cellHeight - height) / 2f;
        pageFrames.set(i, new PageFrame(i, left, top, width, height, old.pageWidth, old.pageHeight));
      }
      contentWidth = maxWidth;
      contentHeight = Math.max(getHeight(), pageFrames.size() * cellHeight);
    } else {
      float y = PAGE_PADDING;
      for (int i = 0; i < pageFrames.size(); i += 1) {
        PageFrame old = pageFrames.get(i);
        float baseScale = availableWidth / (float) old.pageWidth;
        float width = old.pageWidth * baseScale * zoom;
        float height = old.pageHeight * baseScale * zoom;
        maxWidth = Math.max(maxWidth, width + PAGE_PADDING * 2);
        float left = Math.max(PAGE_PADDING, (maxWidth - width) / 2f);
        pageFrames.set(i, new PageFrame(i, left, y, width, height, old.pageWidth, old.pageHeight));
        y += height + PAGE_GAP;
      }
      contentWidth = maxWidth;
      contentHeight = Math.max(getHeight(), y + PAGE_PADDING);
    }
    clampOffsets();
  }

  private void requestRender(PageFrame frame, String key) {
    if (loadingKeys.contains(key)) {
      if (DEBUG_RENDER_GAP) Log.d(TAG, "requestRender: already loading key=" + key);
      return;
    }
    long now = SystemClock.uptimeMillis();
    Long last = renderRequestCooldown.get(key);
    if (last != null && now - last < RENDER_COOLDOWN_MS) {
      if (DEBUG_RENDER_GAP) Log.d(TAG, "requestRender: cooldown key=" + key);
      return;
    }
    renderRequestCooldown.put(key, now);
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

    if (DEBUG_RENDER_GAP) {
      Log.d(TAG, "requestRender: start page=" + frame.index + " key=" + key + " size=" + renderWidth + "x" + renderHeight);
    }

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
          if (generationAtStart != renderGeneration) {
            if (finalRendered != null && !finalRendered.isRecycled()) {
              finalRendered.recycle();
            }
            return;
          }
          if (finalRendered != null && !finalRendered.isRecycled()) {
            RENDER_CACHE.put(key, finalRendered);
            lastPageBitmap.put(frame.index, finalRendered);
            if (DEBUG_RENDER_GAP) {
              Log.d(TAG, "requestRender: complete page=" + frame.index + " key=" + key + " cacheSize=" + RENDER_CACHE.size());
            }
          }
          invalidate();
        });
      } catch (OutOfMemoryError error) {
        Bitmap failed = rendered;
        post(() -> {
          loadingKeys.remove(key);
          if (failed != null && !failed.isRecycled()) failed.recycle();
          Log.e(TAG, "Unable to allocate bitmap for dedicated PDF page; keeping previous surface", error);
        });
      } catch (RuntimeException error) {
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
    // Bucket zoom to prevent tiny fluctuations from changing the key during scroll/pan
    float zoomBucket = Math.round(zoom * 100f) / 100f;
    int widthPx = Math.max(1, Math.round(frame.width));
    int heightPx = Math.max(1, Math.round(frame.height));
    return source + ":" + docIdentity + ":" + frame.index + ":" + widthPx + "x" + heightPx + ":z" + zoomBucket + ":" + pageTheme;
  }

  private void clampOffsets() {
    offsetX = clamp(offsetX, 0f, Math.max(0f, contentWidth - getWidth()));
    float maxY = Math.max(0f, contentHeight - getHeight());
    if ("single".equals(viewMode) && !pageFrames.isEmpty()) {
      offsetY = clamp(offsetY, 0f, maxY);
    } else {
      offsetY = clamp(offsetY, 0f, maxY);
    }
  }

  private void snapToPage(int pageIndex) {
    if (pageFrames.isEmpty() || pageIndex < 0 || pageIndex >= pageFrames.size()) return;
    if ("single".equals(viewMode)) {
      float targetY = pageIndex * getHeight();
      float maxY = Math.max(0f, contentHeight - getHeight());
      targetY = clamp(targetY, 0f, maxY);
      offsetY = targetY;
    } else {
      PageFrame frame = pageFrames.get(pageIndex);
      float targetY = frame.top - PAGE_PADDING;
      float maxY = Math.max(0f, contentHeight - getHeight());
      targetY = clamp(targetY, 0f, maxY);
      offsetY = targetY;
    }
    clampOffsets();
    invalidate();
    emitPageChanged(pageIndex + 1);
  }

  private void emitScrollEvent(float offsetYValue) {
    if (ISOLATE_RENDER_TEST) return;
    if (isPinching) return;
    try {
      if (pendingScrollEvent != null) {
        eventThrottleHandler.removeCallbacks(pendingScrollEvent);
      }
      pendingScrollEvent = () -> {
        int visiblePage = computeVisiblePage();
        if (visiblePage > 0) {
          emitPageChanged(visiblePage);
        }
        WritableMap event = Arguments.createMap();
        event.putDouble("offsetY", offsetYValue);
        reactContext.getJSModule(RCTEventEmitter.class)
          .receiveEvent(getId(), "onScroll", event);
        emitVisiblePagesChanged();
        pendingScrollEvent = null;
      };
      eventThrottleHandler.postDelayed(pendingScrollEvent, 80);
    } catch (Throwable ignored) {
    }
  }

  private void emitVisiblePagesChanged() {
    if (ISOLATE_RENDER_TEST) return;
    if (isPinching) return;
    // Dead zone: when viewport center is in a page gap, do not emit
    // visiblePages events at all to prevent JS/native flicker loops.
    if (isViewportCenterInsidePageGap()) {
      if (DEBUG_GAP) {
        Log.d(TAG, "emitVisiblePagesChanged: center in gap, skipping. " +
          "zoom=" + zoom + " offsetY=" + offsetY + " lastStablePage=" + lastStablePage);
      }
      return;
    }
    try {
      VisiblePagesResult result = buildVisiblePagesResult();

      // Do not emit empty visiblePages when viewport is in a page gap.
      // Preserve the last stable signature to prevent JS/native loop and flicker.
      if (!result.hasStableVisiblePage) {
        if (DEBUG_GAP) {
          Log.d(TAG, "emitVisiblePagesChanged: no stable page (gap), skipping. " +
            "zoom=" + zoom + " offsetY=" + offsetY + " lastStablePage=" + lastStablePage);
        }
        return;
      }

      if (result.signature.equals(lastVisiblePagesSignature)) {
        return;
      }

      lastVisiblePagesSignature = result.signature;

      if (DEBUG_GAP) {
        Log.d(TAG, "emitVisiblePagesChanged: signature=" + result.signature +
          " zoom=" + zoom + " offsetY=" + offsetY + " lastStablePage=" + lastStablePage);
      }

      WritableMap event = Arguments.createMap();
      event.putArray("pages", result.pages);
      reactContext.getJSModule(RCTEventEmitter.class)
        .receiveEvent(getId(), "onVisiblePagesChange", event);
    } catch (Throwable ignored) {
    }
  }

  private static class VisiblePagesResult {
    final WritableArray pages;
    final String signature;
    final boolean hasStableVisiblePage;

    VisiblePagesResult(WritableArray pages, String signature, boolean hasStableVisiblePage) {
      this.pages = pages;
      this.signature = signature;
      this.hasStableVisiblePage = hasStableVisiblePage;
    }
  }

  private VisiblePagesResult buildVisiblePagesResult() {
    WritableArray pages = Arguments.createArray();
    StringBuilder signature = new StringBuilder();

    if (pageFrames.isEmpty() || getHeight() <= 0) {
      return new VisiblePagesResult(pages, "", false);
    }

    float viewportTop = offsetY;
    float viewportBottom = offsetY + getHeight();
    float threshold = getVisibleRatioThreshold();

    for (PageFrame frame : pageFrames) {
      float frameTop = frame.top;
      float frameBottom = frame.top + frame.height;
      float visibleTop = Math.max(frameTop, viewportTop);
      float visibleBottom = Math.min(frameBottom, viewportBottom);
      float visibleHeight = visibleBottom - visibleTop;

      if (visibleHeight <= 0f || frame.height <= 0f) continue;

      float ratio = clamp(visibleHeight / frame.height, 0f, 1f);

      // Ignore micro-visibility near page gaps to avoid jitter
      if (ratio < threshold) continue;

      // Bucket ratio to prevent tiny fluctuations from triggering events
      float bucketedRatio =
        Math.round(ratio / VISIBLE_RATIO_BUCKET) * VISIBLE_RATIO_BUCKET;

      WritableMap item = Arguments.createMap();
      item.putInt("pageIndex", frame.index);
      item.putDouble("visibleRatio", bucketedRatio);
      pages.pushMap(item);

      signature
        .append(frame.index)
        .append(":")
        .append(Math.round(bucketedRatio * 100))
        .append(";");
    }

    boolean hasStableVisiblePage = signature.length() > 0;
    return new VisiblePagesResult(pages, signature.toString(), hasStableVisiblePage);
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

    if (selectPageIndex == frame.index && !selectedRects.isEmpty()) {
      overlayPaint.setColor(Color.argb(120, 66, 133, 244));
      for (NormalizedRect rect : selectedRects) {
        float rLeft = left + rect.x * scaleX;
        float rTop = top + rect.y * scaleY;
        float rRight = rLeft + rect.width * scaleX;
        float rBottom = rTop + rect.height * scaleY;
        canvas.drawRect(rLeft, rTop, rRight, rBottom, overlayPaint);
      }
      // Draw selection handles
      float density = getResources().getDisplayMetrics().density;
      float radius = HANDLE_RADIUS_DP * density;
      overlayPaint.setColor(HANDLE_COLOR);
      overlayPaint.setStyle(Paint.Style.FILL);
      // Start handle (top-left of first rect)
      NormalizedRect firstRect = selectedRects.get(0);
      float hStartCx = left + firstRect.x * scaleX;
      float hStartCy = top + firstRect.y * scaleY;
      canvas.drawCircle(hStartCx, hStartCy, radius, overlayPaint);
      // End handle (bottom-right of last rect)
      NormalizedRect lastRect = selectedRects.get(selectedRects.size() - 1);
      float hEndCx = left + (lastRect.x + lastRect.width) * scaleX;
      float hEndCy = top + (lastRect.y + lastRect.height) * scaleY;
      canvas.drawCircle(hEndCx, hEndCy, radius, overlayPaint);
      overlayPaint.setStyle(Paint.Style.FILL);
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
          overlayPaint.setStyle(Paint.Style.STROKE);
          overlayPaint.setStrokeWidth(Math.max(2f, scaleY * 0.008f));
          canvas.drawLine(rLeft, rBottom - 2, rRight, rBottom - 2, overlayPaint);
          overlayPaint.setStyle(Paint.Style.FILL);
        } else if ("strikeout".equals(annotation.type)) {
          overlayPaint.setStyle(Paint.Style.STROKE);
          overlayPaint.setStrokeWidth(Math.max(2f, scaleY * 0.008f));
          canvas.drawLine(rLeft, (rTop + rBottom) / 2f, rRight, (rTop + rBottom) / 2f, overlayPaint);
          overlayPaint.setStyle(Paint.Style.FILL);
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
    final int pageWidth;
    final int pageHeight;

    PageFrame(int index, float left, float top, float width, float height, int pageWidth, int pageHeight) {
      this.index = index;
      this.left = left;
      this.top = top;
      this.width = width;
      this.height = height;
      this.pageWidth = pageWidth;
      this.pageHeight = pageHeight;
    }
  }
}
