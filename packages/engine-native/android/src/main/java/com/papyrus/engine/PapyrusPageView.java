package com.papyrus.engine;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.view.View;

import com.shockwave.pdfium.PdfDocument;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

class PapyrusPageView extends View {
  private static final ExecutorService RENDER_EXECUTOR = Executors.newSingleThreadExecutor();

  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  private Bitmap bitmap;

  PapyrusPageView(Context context) {
    super(context);
  }

  PapyrusPageView(Context context, AttributeSet attrs) {
    super(context, attrs);
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
    final int renderWidth = Math.max(1, (int) (viewWidth * targetScale));
    final int renderHeight = Math.max(1, (int) (viewHeight * targetScale));

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
    canvas.drawBitmap(bitmap, null, dest, paint);
  }
}
