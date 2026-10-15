package com.papyrus.engine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.SystemClock;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.util.SparseArray;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.PagerSnapHelper;
import androidx.recyclerview.widget.RecyclerView;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.HashSet;
import java.util.Set;

public final class PapyrusComicDocumentView extends FrameLayout {
  private static final ExecutorService DECODE_EXECUTOR = Executors.newFixedThreadPool(2);
  private static final int MAX_DECODED_BYTES = 64 * 1024 * 1024;
  private static final android.util.LruCache<String, Bitmap> BITMAPS = new android.util.LruCache<String, Bitmap>(MAX_DECODED_BYTES) {
    @Override protected int sizeOf(@NonNull String key, @NonNull Bitmap value) { return value.getAllocationByteCount(); }
  };

  private final RecyclerView recyclerView;
  private final ComicAdapter adapter;
  private LinearLayoutManager layoutManager;
  private PagerSnapHelper snapHelper;
  private String engineId;
  private int generation;
  private int pageCount;
  private int currentPage = 1;
  private String layoutMode = "single";
  private String fitMode = "width";
  private String readingDirection = "ltr";
  private String pageTheme = "normal";
  private float zoom = 1f;
  private long lastPageEvent;
  private final ScaleGestureDetector scaleDetector;
  private final GestureDetector tapDetector;
  private final PapyrusComicZoomFrame zoomFrame = new PapyrusComicZoomFrame();
  private final Set<String> emittedErrors = new HashSet<>();
  private float lastPanX;
  private float lastPanY;
  private float panX;
  private float panY;

  public PapyrusComicDocumentView(Context context) {
    super(context);
    recyclerView = new PapyrusComicRecyclerView(context);
    recyclerView.setOverScrollMode(View.OVER_SCROLL_NEVER);
    adapter = new ComicAdapter();
    recyclerView.setAdapter(adapter);
    addView(recyclerView, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
    recyclerView.addOnScrollListener(new RecyclerView.OnScrollListener() {
      @Override public void onScrollStateChanged(@NonNull RecyclerView view, int state) {
        if (state == RecyclerView.SCROLL_STATE_IDLE) emitCurrentPage();
      }
    });
    scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
      @Override public boolean onScale(ScaleGestureDetector detector) {
        float next = zoomFrame.nextZoom(zoom, detector.getScaleFactor());
        if (zoomFrame.offer(next, detector.getFocusX(), detector.getFocusY())) {
          PapyrusComicDocumentView.this.postOnAnimation(PapyrusComicDocumentView.this::applyPendingZoom);
        }
        return true;
      }
      @Override public void onScaleEnd(ScaleGestureDetector detector) {
        applyPendingZoom();
        emitZoom();
      }
    });
    tapDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
      @Override public boolean onDown(MotionEvent event) { return true; }
      @Override public boolean onDoubleTap(MotionEvent event) {
        if (scaleDetector.isInProgress()) return false;
        zoomFrame.clear();
        applyZoom(zoom > 1.05f ? 1f : 2f, event.getX(), event.getY());
        emitZoom();
        return true;
      }
      @Override public boolean onSingleTapConfirmed(MotionEvent event) {
        if (scaleDetector.isInProgress() || pageCount <= 0) return false;
        emitPageTap();
        return true;
      }
    });
    setLayoutMode(layoutMode);
    applyTheme();
  }

  @Override protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
    super.onSizeChanged(width, height, oldWidth, oldHeight);
    if (width > 0 && height > 0 && pageCount > 0) {
      post(() -> {
        adapter.notifyDataSetChanged();
        scrollToCurrentPage();
      });
    }
  }

  public void setEngineId(String value) {
    if (value == null ? engineId != null : !value.equals(engineId)) {
      zoomFrame.clear();
      adapter.clearPageDimensions();
    }
    engineId = value;
    adapter.notifyDataSetChanged();
  }
  public void setDocumentGeneration(int value) {
    if (generation != value) {
      zoomFrame.clear();
      generation = value;
      adapter.clearPageDimensions();
      adapter.notifyDataSetChanged();
    }
  }
  public void setPageCount(int value) {
    int nextCount = Math.max(0, value);
    if (pageCount != nextCount) {
      zoomFrame.clear();
      adapter.clearPageDimensions();
    }
    pageCount = nextCount;
    adapter.notifyDataSetChanged();
    scrollToCurrentPage();
  }
  public void setCurrentPage(int value) {
    int clamped = pageCount > 0 ? Math.max(1, Math.min(pageCount, value)) : Math.max(1, value);
    if (clamped != currentPage) { currentPage = clamped; scrollToCurrentPage(); }
  }
  public void setLayoutMode(String value) {
    String nextMode = "continuous".equals(value) ? "continuous" : "single";
    if (!nextMode.equals(layoutMode)) {
      applyPendingZoom();
      panX = PapyrusComicPageLayout.panForLayout(panX, recyclerView.getWidth(), zoom, "continuous".equals(nextMode));
      panY = 0;
      adapter.setPan(panX, panY);
    }
    layoutMode = nextMode;
    int orientation = "continuous".equals(layoutMode) ? RecyclerView.VERTICAL : RecyclerView.HORIZONTAL;
    boolean reverse = orientation == RecyclerView.HORIZONTAL && "rtl".equals(readingDirection);
    layoutManager = new LinearLayoutManager(getContext(), orientation, reverse);
    recyclerView.setLayoutManager(layoutManager);
    if (snapHelper != null) snapHelper.attachToRecyclerView(null);
    snapHelper = orientation == RecyclerView.HORIZONTAL ? new PagerSnapHelper() : null;
    if (snapHelper != null) snapHelper.attachToRecyclerView(recyclerView);
    adapter.notifyDataSetChanged();
    scrollToCurrentPage();
  }
  public void setFitMode(String value) { fitMode = value == null ? "width" : value; adapter.notifyDataSetChanged(); }
  public void setReadingDirection(String value) { readingDirection = "rtl".equals(value) ? "rtl" : "ltr"; setLayoutMode(layoutMode); }
  public void setZoom(float value) {
    zoomFrame.clear();
    applyZoom(value, recyclerView.getWidth() / 2f, recyclerView.getHeight() / 2f);
  }
  private void applyPendingZoom() {
    PapyrusComicZoomFrame.Update update = zoomFrame.takePending();
    if (update != null) applyZoom(update.zoom, update.focusX, update.focusY);
  }
  private void restoreVisibleAnchor(String sourceEngineId, int sourceGeneration,
      LinearLayoutManager sourceLayoutManager, int position, int top) {
    if (sourceLayoutManager != layoutManager ||
        !PapyrusComicPageLayout.canRestoreAnchor(sourceEngineId, sourceGeneration,
          engineId, generation, "continuous".equals(layoutMode), position, pageCount)) return;
    sourceLayoutManager.scrollToPositionWithOffset(position, top);
  }
  private void applyZoom(float value, float focusX, float focusY) {
    float next = Math.max(1f, Math.min(5f, value));
    if (Math.abs(next - zoom) < 0.0001f) return;
    float previous = zoom;
    View anchor = "continuous".equals(layoutMode) ? recyclerView.findChildViewUnder(focusX, focusY) : null;
    if ("continuous".equals(layoutMode) && anchor == null) {
      anchor = findClosestVisiblePage(focusX, focusY);
    }
    int position = anchor == null ? RecyclerView.NO_POSITION : recyclerView.getChildAdapterPosition(anchor);
    int top = anchor == null ? 0 : anchor.getTop();
    int height = anchor == null ? 0 : anchor.getHeight();
    zoom = next;
    if ("continuous".equals(layoutMode)) {
      panX = PapyrusComicPageLayout.clampPanX(focusX - (focusX - panX) * next / previous, recyclerView.getWidth(), next);
      panY = 0;
      adapter.setZoom(next);
      adapter.setPan(panX, 0);
      if (layoutManager != null && position != RecyclerView.NO_POSITION && height > 0) {
        layoutManager.scrollToPositionWithOffset(position,
          PapyrusComicPageLayout.zoomAnchorTopForItem(top, focusY, height, previous, next));
      }
      recyclerView.requestLayout();
    } else {
      if (next == 1f) { panX = 0; panY = 0; adapter.setPan(0, 0); }
      adapter.setZoom(next);
    }
  }

  private View findClosestVisiblePage(float focusX, float focusY) {
    View closest = null;
    float bestDistance = Float.MAX_VALUE;
    for (int i = 0; i < recyclerView.getChildCount(); i++) {
      View child = recyclerView.getChildAt(i);
      float left = child.getLeft() + child.getTranslationX();
      float top = child.getTop() + child.getTranslationY();
      float right = left + child.getWidth();
      float bottom = top + child.getHeight();
      float dx = focusX < left ? left - focusX : focusX > right ? focusX - right : 0f;
      float dy = focusY < top ? top - focusY : focusY > bottom ? focusY - bottom : 0f;
      float distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        closest = child;
      }
    }
    return closest;
  }

  public void setPageTheme(String value) { pageTheme = value == null ? "normal" : value; applyTheme(); }

  @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) {
    scaleDetector.onTouchEvent(event);
    // Feed pointer transitions too so a pinch cancels a pending single tap,
    // while the detector still arbitrates a single tap against double-tap zoom.
    tapDetector.onTouchEvent(event);
    if (event.getActionMasked() == android.view.MotionEvent.ACTION_POINTER_UP && event.getPointerCount() > 1) {
      int remaining = event.getActionIndex() == 0 ? 1 : 0;
      lastPanX = event.getX(remaining); lastPanY = event.getY(remaining);
    }
    if (event.getActionMasked() == android.view.MotionEvent.ACTION_DOWN) {
      lastPanX = event.getX();
      lastPanY = event.getY();
    }
    return super.dispatchTouchEvent(event);
  }

  @Override public boolean onInterceptTouchEvent(android.view.MotionEvent event) {
    if (scaleDetector.isInProgress()) return true;
    if (zoom > 1f && event.getPointerCount() == 1 && event.getActionMasked() == android.view.MotionEvent.ACTION_MOVE) {
      if ("continuous".equals(layoutMode)) {
        float dx = Math.abs(event.getX() - lastPanX), dy = Math.abs(event.getY() - lastPanY);
        return dx > android.view.ViewConfiguration.get(getContext()).getScaledTouchSlop() && dx > dy;
      }
      return true;
    }
    return super.onInterceptTouchEvent(event);
  }

  @Override public boolean onTouchEvent(android.view.MotionEvent event) {
    if (scaleDetector.isInProgress()) return true;
    if (zoom > 1f && event.getPointerCount() == 1) {
      if (event.getActionMasked() == android.view.MotionEvent.ACTION_MOVE) {
        if ("continuous".equals(layoutMode)) {
          panX = PapyrusComicPageLayout.clampPanX(panX + event.getX() - lastPanX, recyclerView.getWidth(), zoom);
          recyclerView.scrollBy(0, Math.round(lastPanY - event.getY()));
          lastPanX = event.getX(); lastPanY = event.getY();
          adapter.setPan(panX, 0);
          emitCurrentPage();
          return true;
        }
        panX += event.getX() - lastPanX;
        panY += event.getY() - lastPanY;
        lastPanX = event.getX();
        lastPanY = event.getY();
        float maxX = recyclerView.getWidth() * (zoom - 1f) / 2f;
        float maxY = recyclerView.getHeight() * (zoom - 1f) / 2f;
        panX = Math.max(-maxX, Math.min(maxX, panX));
        panY = Math.max(-maxY, Math.min(maxY, panY));
        adapter.setPan(panX, panY);
      }
      return true;
    }
    return super.onTouchEvent(event);
  }

  private int adapterPositionForPage(int page) {
    return Math.max(0, Math.min(Math.max(pageCount - 1, 0), page - 1));
  }
  private int pageForAdapterPosition(int position) {
    return position + 1;
  }
  private void scrollToCurrentPage() {
    if (layoutManager != null && pageCount > 0) layoutManager.scrollToPositionWithOffset(adapterPositionForPage(currentPage), 0);
  }
  private void emitCurrentPage() {
    int position = layoutManager == null ? RecyclerView.NO_POSITION : layoutManager.findFirstVisibleItemPosition();
    if (position == RecyclerView.NO_POSITION || pageCount == 0) return;
    View snap = snapHelper == null ? null : snapHelper.findSnapView(layoutManager);
    if (snap != null) position = recyclerView.getChildAdapterPosition(snap);
    int page = Math.max(1, Math.min(pageCount, pageForAdapterPosition(position)));
    if (page == currentPage || SystemClock.elapsedRealtime() - lastPageEvent < 80) return;
    currentPage = page;
    lastPageEvent = SystemClock.elapsedRealtime();
    ReactContext context = (ReactContext) getContext();
    com.facebook.react.bridge.WritableMap payload = Arguments.createMap();
    payload.putInt("page", page);
    context.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), "onPageChanged", payload);
  }
  private void emitZoom() {
    ReactContext context = (ReactContext) getContext();
    com.facebook.react.bridge.WritableMap payload = Arguments.createMap();
    payload.putDouble("zoom", zoom);
    context.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), "onZoomChanged", payload);
  }
  private void emitPageTap() {
    ReactContext context = (ReactContext) getContext();
    com.facebook.react.bridge.WritableMap payload = Arguments.createMap();
    payload.putInt("page", currentPage);
    context.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), "onPageTap", payload);
  }
  private void emitError(String key, String message, String sourceEngineId, int sourceGeneration) {
    synchronized (emittedErrors) {
      if (!emittedErrors.add(key)) return;
    }
    post(() -> {
      if (!sourceEngineId.equals(engineId) || sourceGeneration != generation) return;
      ReactContext context = (ReactContext) getContext();
      com.facebook.react.bridge.WritableMap payload = Arguments.createMap();
      payload.putString("message", message == null ? "Unable to decode comic page" : message);
      context.getJSModule(RCTEventEmitter.class).receiveEvent(getId(), "onError", payload);
    });
  }
  private void applyTheme() {
    int background = "dark".equals(pageTheme) ? Color.rgb(26, 26, 28) : "sepia".equals(pageTheme) ? Color.rgb(239, 229, 207) : Color.BLACK;
    setBackgroundColor(background);
    recyclerView.setBackgroundColor(background);
  }

  private final class ComicAdapter extends RecyclerView.Adapter<ComicHolder> {
    private float imageZoom = 1f;
    private float imagePanX;
    private float imagePanY;
    private final SparseArray<PageDimensions> pageDimensions = new SparseArray<>();

    void clearPageDimensions() { pageDimensions.clear(); }

    private PageDimensions pageDimensionsFor(int position) {
      if (position < 0 || position >= pageCount || engineId == null) return null;
      PageDimensions cached = pageDimensions.get(position);
      if (cached != null) return cached.isKnown() ? cached : null;
      int[] dimensions = PapyrusComicArchiveNative.getPageDimensions(engineId, generation, position);
      PageDimensions result = dimensions != null && dimensions.length >= 2 && dimensions[0] > 0 && dimensions[1] > 0
        ? new PageDimensions(dimensions[0], dimensions[1]) : PageDimensions.UNKNOWN;
      pageDimensions.put(position, result);
      return result.isKnown() ? result : null;
    }

    private PageDimensions layoutDimensionsFor(int position) {
      PageDimensions exact = pageDimensionsFor(position);
      if (exact != null) return exact;
      for (int distance = 1; distance <= 8; distance++) {
        PageDimensions before = pageDimensionsFor(position - distance);
        if (before != null) return before;
        PageDimensions after = pageDimensionsFor(position + distance);
        if (after != null) return after;
      }
      return null;
    }

    private int itemHeightFor(int position) {
      PageDimensions dimensions = layoutDimensionsFor(position);
      return PapyrusComicPageLayout.zoomedHeight(
        dimensions == null ? 0 : dimensions.width,
        dimensions == null ? 0 : dimensions.height,
        recyclerView.getWidth(), recyclerView.getHeight(), layoutMode, fitMode, zoom);
    }

    private void rememberPageDimensions(int position, int width, int height) {
      if (position >= 0 && width > 0 && height > 0) pageDimensions.put(position, new PageDimensions(width, height));
    }

    @NonNull @Override public ComicHolder onCreateViewHolder(@NonNull android.view.ViewGroup parent, int type) {
      FrameLayout cell = new FrameLayout(parent.getContext());
      cell.setLayoutParams(new RecyclerView.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
      cell.setBackgroundColor(Color.TRANSPARENT);
      ComicPageScrollView pageScrollView = new ComicPageScrollView(parent.getContext());
      pageScrollView.setFillViewport(true);
      pageScrollView.setVerticalScrollBarEnabled(false);
      ImageView image = new ImageView(parent.getContext());
      image.setScaleType(ImageView.ScaleType.FIT_CENTER);
      pageScrollView.addView(image, new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
      cell.addView(pageScrollView, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
      return new ComicHolder(cell, pageScrollView, image);
    }
    @Override public void onBindViewHolder(@NonNull ComicHolder holder, int position) {
      RecyclerView.LayoutParams itemParams = (RecyclerView.LayoutParams) holder.itemView.getLayoutParams();
      itemParams.width = "continuous".equals(layoutMode) ? PapyrusComicPageLayout.zoomedWidth(recyclerView.getWidth(), zoom) : Math.max(1, recyclerView.getWidth());
      itemParams.height = "continuous".equals(layoutMode) ? itemHeightFor(position) : Math.max(1, recyclerView.getHeight());
      holder.itemView.setLayoutParams(itemParams);
      final int logicalPage = position;
      final String id = engineId;
      final int docGeneration = generation;
      final int token = ++holder.bindToken;
      holder.image.setImageDrawable(null);
      boolean continuous = "continuous".equals(layoutMode);
      holder.image.setScaleX(continuous ? 1f : imageZoom);
      holder.image.setScaleY(continuous ? 1f : imageZoom);
      holder.image.setTranslationX(continuous ? 0f : imagePanX);
      holder.image.setTranslationY(continuous ? 0f : imagePanY);
      holder.itemView.setTranslationX(continuous ? imagePanX : 0f);
      PageDimensions indexedDimensions = layoutDimensionsFor(position);
      configurePageImage(holder, indexedDimensions == null ? 0 : indexedDimensions.width,
        indexedDimensions == null ? 0 : indexedDimensions.height);
      String key = id + ":" + docGeneration + ":" + logicalPage;
      Bitmap cached = BITMAPS.get(key);
      if (cached != null) {
        applyPageHeightForImage(holder, logicalPage, cached.getWidth(), cached.getHeight(), false);
        holder.image.setImageBitmap(cached);
        configurePageImage(holder, cached.getWidth(), cached.getHeight());
        return;
      }
      DECODE_EXECUTOR.execute(() -> {
          Bitmap bitmap = null;
          try {
            String path = PapyrusComicArchiveNative.extractPage(id, docGeneration, logicalPage);
          BitmapFactory.Options bounds = new BitmapFactory.Options();
          bounds.inJustDecodeBounds = true;
          BitmapFactory.decodeFile(path, bounds);
          if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            emitError(key, "Unsupported or corrupt comic image", id, docGeneration);
            return;
          }
          if (bounds.outWidth > 20000 || bounds.outHeight > 20000 || (long) bounds.outWidth * (long) bounds.outHeight > 80_000_000L) {
            emitError(key, "Comic image exceeds supported dimensions", id, docGeneration);
            return;
          }
          if (bounds.outWidth > 0 && bounds.outHeight > 0) {
            post(() -> {
              if (holder.bindToken == token && id.equals(engineId) && docGeneration == generation) {
                applyPageHeightForImage(holder, logicalPage, bounds.outWidth, bounds.outHeight, true);
              }
            });
            int maxEdge = Math.max(getWidth(), getHeight()) * 2;
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / sample > Math.max(maxEdge, 1024) ||
              ((long) bounds.outWidth / sample) * ((long) bounds.outHeight / sample) > 8_000_000L) sample *= 2;
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = sample;
            bitmap = BitmapFactory.decodeFile(path, options);
          }
        } catch (Throwable error) {
          emitError(key, error.getMessage(), id, docGeneration);
        }
        if (bitmap == null) return;
        BITMAPS.put(key, bitmap);
          Bitmap result = bitmap;
        post(() -> {
          if (holder.bindToken == token && id.equals(engineId) && docGeneration == generation) {
            holder.image.setImageBitmap(result);
            configurePageImage(holder, result.getWidth(), result.getHeight());
          }
        });
      });
    }
    @Override public int getItemCount() { return pageCount; }
    @Override public void onViewAttachedToWindow(@NonNull ComicHolder holder) {
      super.onViewAttachedToWindow(holder);
      // Prefetched/scrapped holders can be attached without another bind after a pinch.
      // Synchronize their geometry too, so an old viewport-width cell cannot clip the image.
      boolean continuous = "continuous".equals(layoutMode);
      RecyclerView.LayoutParams params = (RecyclerView.LayoutParams) holder.itemView.getLayoutParams();
      params.width = continuous ? PapyrusComicPageLayout.zoomedWidth(recyclerView.getWidth(), zoom) : Math.max(1, recyclerView.getWidth());
      holder.itemView.setLayoutParams(params);
      holder.itemView.setTranslationX(continuous ? imagePanX : 0f);
      holder.image.setScaleX(continuous ? 1f : imageZoom);
      holder.image.setScaleY(continuous ? 1f : imageZoom);
      holder.image.setTranslationX(continuous ? 0f : imagePanX);
      holder.image.setTranslationY(continuous ? 0f : imagePanY);
      int position = holder.getBindingAdapterPosition();
      PageDimensions indexedDimensions = layoutDimensionsFor(position);
      if (indexedDimensions != null && continuous) {
        applyPageHeightForDimensions(holder, position, indexedDimensions.width, indexedDimensions.height);
      } else if (holder.image.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
        Bitmap bitmap = ((android.graphics.drawable.BitmapDrawable) holder.image.getDrawable()).getBitmap();
        applyPageHeightForImage(holder, position, bitmap.getWidth(), bitmap.getHeight(), false);
      } else if (continuous) {
        applyPageHeightForDimensions(holder, position, 0, 0);
      }
      holder.itemView.forceLayout();
      recyclerView.requestLayout();
    }
    private void applyPageHeightForImage(ComicHolder holder, int position, int imageWidth, int imageHeight, boolean preserveVisibleAnchor) {
      int oldHeight = holder.itemView.getLayoutParams() instanceof RecyclerView.LayoutParams
        ? ((RecyclerView.LayoutParams) holder.itemView.getLayoutParams()).height : 0;
      int anchorPosition = RecyclerView.NO_POSITION;
      int anchorTop = 0;
      if (preserveVisibleAnchor && "continuous".equals(layoutMode) && layoutManager != null) {
        anchorPosition = layoutManager.findFirstVisibleItemPosition();
        View anchorView = anchorPosition == RecyclerView.NO_POSITION ? null : layoutManager.findViewByPosition(anchorPosition);
        if (anchorView != null) anchorTop = anchorView.getTop();
      }
      rememberPageDimensions(position, imageWidth, imageHeight);
      applyPageHeightForDimensions(holder, position, imageWidth, imageHeight);
      int newHeight = holder.itemView.getLayoutParams() instanceof RecyclerView.LayoutParams
        ? ((RecyclerView.LayoutParams) holder.itemView.getLayoutParams()).height : oldHeight;
      if (preserveVisibleAnchor && oldHeight != newHeight && position >= 0 &&
          anchorPosition != RecyclerView.NO_POSITION && position <= anchorPosition && layoutManager != null) {
        final int preservePosition = anchorPosition;
        final int preserveTop = anchorTop;
        final String sourceEngineId = engineId;
        final int sourceGeneration = generation;
        final LinearLayoutManager sourceLayoutManager = layoutManager;
        recyclerView.post(() -> restoreVisibleAnchor(sourceEngineId, sourceGeneration,
          sourceLayoutManager, preservePosition, preserveTop));
      }
    }

    private void applyPageHeightForDimensions(ComicHolder holder, int position, int imageWidth, int imageHeight) {
      if (!(holder.itemView.getLayoutParams() instanceof RecyclerView.LayoutParams)) return;
      RecyclerView.LayoutParams params = (RecyclerView.LayoutParams) holder.itemView.getLayoutParams();
      int height;
      if ("continuous".equals(layoutMode)) {
        PageDimensions dimensions = imageWidth > 0 && imageHeight > 0
          ? new PageDimensions(imageWidth, imageHeight) : layoutDimensionsFor(position);
        height = dimensions == null ? PapyrusComicPageLayout.zoomedFallbackHeight(
          recyclerView.getWidth(), recyclerView.getHeight(), layoutMode, fitMode, zoom) : PapyrusComicPageLayout.zoomedHeight(
          dimensions.width, dimensions.height, recyclerView.getWidth(), recyclerView.getHeight(), layoutMode, fitMode, zoom);
      } else {
        height = Math.max(1, recyclerView.getHeight());
      }
      if (params.height != height) {
        params.height = height;
        holder.itemView.setLayoutParams(params);
      }
      configurePageImage(holder, imageWidth, imageHeight);
    }

    private void updatePageGeometryForZoom(ComicHolder holder, int position, float value) {
      if (position < 0 || !(holder.itemView.getLayoutParams() instanceof RecyclerView.LayoutParams)) return;
      PageDimensions dimensions = layoutDimensionsFor(position);
      if (dimensions == null && holder.image.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
        Bitmap bitmap = ((android.graphics.drawable.BitmapDrawable) holder.image.getDrawable()).getBitmap();
        dimensions = new PageDimensions(bitmap.getWidth(), bitmap.getHeight());
      }

      RecyclerView.LayoutParams params = (RecyclerView.LayoutParams) holder.itemView.getLayoutParams();
      int width = PapyrusComicPageLayout.zoomedWidth(recyclerView.getWidth(), value);
      int height = dimensions == null ? PapyrusComicPageLayout.zoomedFallbackHeight(
        recyclerView.getWidth(), recyclerView.getHeight(), layoutMode, fitMode, value) : PapyrusComicPageLayout.zoomedHeight(
        dimensions.width, dimensions.height, recyclerView.getWidth(), recyclerView.getHeight(), layoutMode, fitMode, value);
      boolean changed = params.width != width || params.height != height;
      if (params.width != width) params.width = width;
      if (params.height != height) params.height = height;
      if (changed) holder.itemView.setLayoutParams(params);
      holder.image.setScaleX(1f);
      holder.image.setScaleY(1f);
      configurePageImage(holder, dimensions == null ? 0 : dimensions.width, dimensions == null ? 0 : dimensions.height);
    }

    private void configurePageImage(ComicHolder holder, int imageWidth, int imageHeight) {
      boolean widthFit = "single".equals(layoutMode) && "width".equals(fitMode) && recyclerView.getWidth() > 0;
      ScrollView.LayoutParams params;
      if ("continuous".equals(layoutMode)) {
        holder.pageScrollView.setVisibility(View.VISIBLE);
        holder.pageScrollView.setFixedPageHeight(true);
        holder.image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        if (!"continuous".equals(holder.configuredLayoutMode)) holder.pageScrollView.scrollTo(0, 0);
        holder.pageScrollView.setVerticalScrollBarEnabled(false);
        holder.pageScrollView.setFillViewport(false);
        RecyclerView.LayoutParams itemParams = (RecyclerView.LayoutParams) holder.itemView.getLayoutParams();
        int pageHeight = itemParams.height > 0 ? itemParams.height : Math.max(1, recyclerView.getHeight());
        setImageLayoutParamsIfChanged(holder, new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, pageHeight));
        holder.configuredLayoutMode = layoutMode;
        return;
      }
      holder.pageScrollView.setVisibility(View.VISIBLE);
      holder.pageScrollView.setFixedPageHeight(false);
      if (widthFit && imageWidth > 0 && imageHeight > 0) {
        int width = recyclerView.getWidth();
        int height = Math.max(1, Math.round(width * ((float) imageHeight / (float) imageWidth)));
        params = new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, height);
        holder.image.setScaleType(ImageView.ScaleType.FIT_XY);
        holder.pageScrollView.setVerticalScrollBarEnabled(height > recyclerView.getHeight());
        holder.pageScrollView.setFillViewport(false);
      } else if (widthFit) {
        params = new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, Math.max(1, recyclerView.getHeight()));
        holder.image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        holder.pageScrollView.setVerticalScrollBarEnabled(false);
        holder.pageScrollView.setFillViewport(true);
      } else {
        params = new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, Math.max(1, recyclerView.getHeight()));
        holder.image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        holder.pageScrollView.setVerticalScrollBarEnabled(false);
        holder.pageScrollView.setFillViewport(true);
      }
      setImageLayoutParamsIfChanged(holder, params);
      holder.configuredLayoutMode = layoutMode;
    }

    private void setImageLayoutParamsIfChanged(ComicHolder holder, ScrollView.LayoutParams params) {
      ViewGroup.LayoutParams current = holder.image.getLayoutParams();
      if (current == null || current.width != params.width || current.height != params.height) {
        holder.image.setLayoutParams(params);
      }
    }
    void setZoom(float value) {
      imageZoom = value;
      for (int i = 0; i < recyclerView.getChildCount(); i++) {
        View child = recyclerView.getChildAt(i);
        RecyclerView.ViewHolder holder = recyclerView.getChildViewHolder(child);
        if (holder instanceof ComicHolder) {
          ComicHolder comicHolder = (ComicHolder) holder;
          ImageView image = comicHolder.image;
          if ("continuous".equals(layoutMode)) {
            int position = recyclerView.getChildAdapterPosition(child);
            updatePageGeometryForZoom(comicHolder, position, value);
          } else {
            image.setScaleX(value); image.setScaleY(value);
          }
        }
      }
    }
    void setPan(float x, float y) {
      imagePanX = x;
      imagePanY = y;
      for (int i = 0; i < recyclerView.getChildCount(); i++) {
        View child = recyclerView.getChildAt(i);
        RecyclerView.ViewHolder holder = recyclerView.getChildViewHolder(child);
        if (holder instanceof ComicHolder) {
          ImageView image = ((ComicHolder) holder).image;
          if ("continuous".equals(layoutMode)) {
            child.setTranslationX(x);
            image.setTranslationX(0f); image.setTranslationY(0f);
          } else {
            child.setTranslationX(0f);
            image.setTranslationX(x); image.setTranslationY(y);
          }
        }
      }
    }
  }
  // React Native owns the outer view layout and can consume child requestLayout.
  // Remeasure the native list when late image dimensions replace placeholder cells.
  private static final class PapyrusComicRecyclerView extends RecyclerView {
    private boolean layoutPending;
    PapyrusComicRecyclerView(Context context) { super(context); }
    @Override public void requestLayout() {
      super.requestLayout();
      if (layoutPending) return;
      layoutPending = true;
      post(() -> {
        try {
          int width = getWidth(), height = getHeight();
          if (width <= 0 || height <= 0) return;
          forceLayout();
          measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY));
          layout(getLeft(), getTop(), getLeft() + width, getTop() + height);
        } finally { layoutPending = false; }
      });
    }
  }

  private static final class ComicPageScrollView extends ScrollView {
    private boolean fixedPageHeight;

    ComicPageScrollView(@NonNull Context context) { super(context); }

    void setFixedPageHeight(boolean fixed) {
      if (fixedPageHeight == fixed) return;
      fixedPageHeight = fixed;
      requestLayout();
    }

    // ScrollView normally measures its child with an unspecified height so it can scroll.
    // Continuous comics already scroll between RecyclerView cells, so that would let the
    // bitmap's intrinsic height exceed the cell and create artificial bands around the art.
    @Override protected void measureChild(View child, int parentWidthMeasureSpec, int parentHeightMeasureSpec) {
      ViewGroup.LayoutParams params = child.getLayoutParams();
      if (!fixedPageHeight || params.height <= 0) {
        super.measureChild(child, parentWidthMeasureSpec, parentHeightMeasureSpec);
        return;
      }
      int childWidthSpec = getChildMeasureSpec(parentWidthMeasureSpec,
        getPaddingLeft() + getPaddingRight(), params.width);
      int childHeightSpec = MeasureSpec.makeMeasureSpec(params.height, MeasureSpec.EXACTLY);
      child.measure(childWidthSpec, childHeightSpec);
    }

    @Override protected void measureChildWithMargins(View child, int parentWidthMeasureSpec, int widthUsed,
        int parentHeightMeasureSpec, int heightUsed) {
      ViewGroup.LayoutParams rawParams = child.getLayoutParams();
      if (!fixedPageHeight || rawParams.height <= 0 || !(rawParams instanceof MarginLayoutParams)) {
        super.measureChildWithMargins(child, parentWidthMeasureSpec, widthUsed, parentHeightMeasureSpec, heightUsed);
        return;
      }
      MarginLayoutParams params = (MarginLayoutParams) rawParams;
      int childWidthSpec = getChildMeasureSpec(parentWidthMeasureSpec,
        getPaddingLeft() + getPaddingRight() + params.leftMargin + params.rightMargin + widthUsed, params.width);
      int childHeightSpec = MeasureSpec.makeMeasureSpec(params.height, MeasureSpec.EXACTLY);
      child.measure(childWidthSpec, childHeightSpec);
    }
  }

  private static final class ComicHolder extends RecyclerView.ViewHolder {
    final ComicPageScrollView pageScrollView;
    final ImageView image;
    int bindToken;
    String configuredLayoutMode;
    ComicHolder(@NonNull View itemView, ComicPageScrollView pageScrollView, ImageView image) {
      super(itemView);
      this.pageScrollView = pageScrollView;
      this.image = image;
    }
  }

  private static final class PageDimensions {
    static final PageDimensions UNKNOWN = new PageDimensions(0, 0);
    final int width;
    final int height;
    PageDimensions(int width, int height) { this.width = width; this.height = height; }
    boolean isKnown() { return width > 0 && height > 0; }
  }
}
