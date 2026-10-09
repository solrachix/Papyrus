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
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

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
    tapDetector = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
      @Override public boolean onDown(MotionEvent event) { return true; }
      @Override public boolean onDoubleTap(MotionEvent event) {
        if (scaleDetector.isInProgress()) return false;
        applyZoom(zoom > 1.05f ? 1f : 2f, event.getX(), event.getY());
        emitZoom();
        return true;
      }
    });
    scaleDetector = new ScaleGestureDetector(context, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
      @Override public boolean onScale(ScaleGestureDetector detector) {
        // Keep gesture frames native. Reflect the final zoom to React Native
        // only once; per-frame bridge writes can feed stale zoom back into
        // the view and cause visible jitter during a pinch.
        applyZoom(zoom * detector.getScaleFactor(), detector.getFocusX(), detector.getFocusY());
        return true;
      }
      @Override public void onScaleEnd(ScaleGestureDetector detector) {
        emitZoom();
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

  public void setEngineId(String value) { engineId = value; adapter.notifyDataSetChanged(); }
  public void setDocumentGeneration(int value) { if (generation != value) { generation = value; adapter.notifyDataSetChanged(); } }
  public void setPageCount(int value) { pageCount = Math.max(0, value); adapter.notifyDataSetChanged(); scrollToCurrentPage(); }
  public void setCurrentPage(int value) {
    int clamped = pageCount > 0 ? Math.max(1, Math.min(pageCount, value)) : Math.max(1, value);
    if (clamped != currentPage) { currentPage = clamped; scrollToCurrentPage(); }
  }
  public void setLayoutMode(String value) {
    String nextMode = "continuous".equals(value) ? "continuous" : "single";
    if (!nextMode.equals(layoutMode)) {
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
    applyZoom(value, recyclerView.getWidth() / 2f, recyclerView.getHeight() / 2f);
  }
  private void applyZoom(float value, float focusX, float focusY) {
    float next = Math.max(1f, Math.min(5f, value));
    if (Math.abs(next - zoom) < 0.0001f) return;
    float previous = zoom;
    int position = layoutManager == null ? RecyclerView.NO_POSITION : layoutManager.findFirstVisibleItemPosition();
    View anchor = position == RecyclerView.NO_POSITION ? null : layoutManager.findViewByPosition(position);
    int top = anchor == null ? 0 : anchor.getTop();
    zoom = next;
    if ("continuous".equals(layoutMode)) {
      panX = PapyrusComicPageLayout.clampPanX(focusX - (focusX - panX) * next / previous, recyclerView.getWidth(), next);
      panY = 0;
      adapter.setZoom(next);
      adapter.setPan(panX, 0);
      if (anchor != null) layoutManager.scrollToPositionWithOffset(position,
        PapyrusComicPageLayout.zoomAnchorTop(top, focusY, previous, next));
      recyclerView.requestLayout();
    } else {
      if (next == 1f) { panX = 0; panY = 0; adapter.setPan(0, 0); }
      adapter.setZoom(next);
    }
  }
  public void setPageTheme(String value) { pageTheme = value == null ? "normal" : value; applyTheme(); }

  @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) {
    scaleDetector.onTouchEvent(event);
    if (event.getPointerCount() == 1 && !scaleDetector.isInProgress()) {
      tapDetector.onTouchEvent(event);
    }
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
    @NonNull @Override public ComicHolder onCreateViewHolder(@NonNull android.view.ViewGroup parent, int type) {
      FrameLayout cell = new FrameLayout(parent.getContext());
      cell.setLayoutParams(new RecyclerView.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
      cell.setBackgroundColor(Color.TRANSPARENT);
      ScrollView pageScrollView = new ScrollView(parent.getContext());
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
      itemParams.height = Math.max(1, recyclerView.getHeight());
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
      String key = id + ":" + docGeneration + ":" + logicalPage;
      Bitmap cached = BITMAPS.get(key);
      if (cached != null) {
        applyPageHeightForImage(holder, cached.getWidth(), cached.getHeight());
        holder.image.setImageBitmap(cached);
        configurePageImage(holder, cached);
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
              if (holder.bindToken == token && id.equals(engineId) && docGeneration == generation) applyPageHeightForImage(holder, bounds.outWidth, bounds.outHeight);
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
            configurePageImage(holder, result);
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
      if (holder.image.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
        Bitmap bitmap = ((android.graphics.drawable.BitmapDrawable) holder.image.getDrawable()).getBitmap();
        applyPageHeightForImage(holder, bitmap.getWidth(), bitmap.getHeight());
      }
      holder.itemView.forceLayout();
      recyclerView.requestLayout();
    }
    private void applyPageHeightForImage(ComicHolder holder, int imageWidth, int imageHeight) {
      if (!(holder.itemView.getLayoutParams() instanceof RecyclerView.LayoutParams)) return;
      RecyclerView.LayoutParams params = (RecyclerView.LayoutParams) holder.itemView.getLayoutParams();
      int height = PapyrusComicPageLayout.zoomedHeight(
        imageWidth,
        imageHeight,
        recyclerView.getWidth(),
        recyclerView.getHeight(),
        layoutMode,
        fitMode,
        zoom
      );
      if (params.height != height) {
        params.height = height;
        holder.itemView.setLayoutParams(params);
      }
    }

    private void configurePageImage(ComicHolder holder, Bitmap bitmap) {
      boolean widthFit = "single".equals(layoutMode) && "width".equals(fitMode) && recyclerView.getWidth() > 0;
      ScrollView.LayoutParams params;
      FrameLayout cell = (FrameLayout) holder.itemView;
      if ("continuous".equals(layoutMode)) {
        if (holder.image.getParent() != cell) {
          ((android.view.ViewGroup) holder.image.getParent()).removeView(holder.image);
          cell.addView(holder.image, new FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT));
        }
        holder.pageScrollView.setVisibility(View.GONE);
        holder.image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        holder.pageScrollView.scrollTo(0, 0);
        return;
      }
      if (holder.image.getParent() != holder.pageScrollView) {
        ((android.view.ViewGroup) holder.image.getParent()).removeView(holder.image);
        holder.pageScrollView.addView(holder.image);
      }
      holder.pageScrollView.setVisibility(View.VISIBLE);
      if (widthFit) {
        int width = recyclerView.getWidth();
        int height = Math.max(1, Math.round(width * ((float) bitmap.getHeight() / (float) bitmap.getWidth())));
        params = new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, height);
        holder.image.setScaleType(ImageView.ScaleType.FIT_XY);
        holder.pageScrollView.setVerticalScrollBarEnabled(height > recyclerView.getHeight());
        holder.pageScrollView.setFillViewport(false);
      } else {
        params = new ScrollView.LayoutParams(LayoutParams.MATCH_PARENT, Math.max(1, recyclerView.getHeight()));
        holder.image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        holder.pageScrollView.setVerticalScrollBarEnabled(false);
        holder.pageScrollView.setFillViewport(true);
      }
      holder.image.setLayoutParams(params);
    }
    void setZoom(float value) {
      imageZoom = value;
      for (int i = 0; i < recyclerView.getChildCount(); i++) {
        View child = recyclerView.getChildAt(i);
        RecyclerView.ViewHolder holder = recyclerView.getChildViewHolder(child);
        if (holder instanceof ComicHolder) {
          ImageView image = ((ComicHolder) holder).image;
          if ("continuous".equals(layoutMode)) {
            RecyclerView.LayoutParams params = (RecyclerView.LayoutParams) child.getLayoutParams();
            params.width = PapyrusComicPageLayout.zoomedWidth(recyclerView.getWidth(), value);
            child.setLayoutParams(params);
            image.setScaleX(1f); image.setScaleY(1f);
            if (image.getDrawable() instanceof android.graphics.drawable.BitmapDrawable) {
              Bitmap bitmap = ((android.graphics.drawable.BitmapDrawable) image.getDrawable()).getBitmap();
              applyPageHeightForImage((ComicHolder) holder, bitmap.getWidth(), bitmap.getHeight());
            }
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

  private static final class ComicHolder extends RecyclerView.ViewHolder {
    final ScrollView pageScrollView;
    final ImageView image;
    int bindToken;
    ComicHolder(@NonNull View itemView, ScrollView pageScrollView, ImageView image) {
      super(itemView);
      this.pageScrollView = pageScrollView;
      this.image = image;
    }
  }
}
