package com.papyrus.engine;

import android.content.Context;
import android.os.ParcelFileDescriptor;

import com.shockwave.pdfium.PdfDocument;
import com.shockwave.pdfium.PdfiumCore;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

final class PapyrusEngineStore {
  static final class EngineState {
    final PdfiumCore pdfium;
    final Object pdfiumLock = new Object();
    volatile boolean isSearching = false;
    PdfDocument document;
    ParcelFileDescriptor fileDescriptor;
    String sourcePath;
    /** Pages this engine opened for drawing or text, least recently used first. */
    final LinkedHashMap<Integer, Boolean> openPages = new LinkedHashMap<>(16, 0.75f, true);
    /** Page sizes in points, so a layout never needs the page open again. */
    final Map<Integer, int[]> pageSizes = new ConcurrentHashMap<>();

    /** Approximate sizes (see {@link #layoutPageSizePoints}). */
    final Map<Integer, int[]> layoutSizes = new ConcurrentHashMap<>();
    final int densityDpi;

    EngineState(PdfiumCore pdfium, int densityDpi) {
      this.pdfium = pdfium;
      this.densityDpi = densityDpi > 0 ? densityDpi : 160;
    }
  }

  private static final Map<String, EngineState> ENGINES = new ConcurrentHashMap<>();

  static String createEngine(Context context) {
    String engineId = UUID.randomUUID().toString();
    ENGINES.put(engineId, new EngineState(new PdfiumCore(context), context.getResources().getDisplayMetrics().densityDpi));
    return engineId;
  }

  static EngineState getEngine(String engineId) {
    if (engineId == null) return null;
    return ENGINES.get(engineId);
  }

  static int engineCount() {
    return ENGINES.size();
  }

  static int loadedDocumentCount() {
    int count = 0;
    for (EngineState state : ENGINES.values()) {
      if (state.document != null) count++;
    }
    return count;
  }

  static int openPageCount() {
    int count = 0;
    for (EngineState state : ENGINES.values()) {
      synchronized (state.pdfiumLock) {
        count += state.openPages.size();
      }
    }
    return count;
  }

  static void destroyEngine(String engineId) {
    EngineState state = ENGINES.remove(engineId);
    if (state == null) return;
    closeDocument(state);
  }

  /** Closes the document and its file under the engine lock: a render in progress finishes first. */
  static void closeDocument(EngineState state) {
    synchronized (state.pdfiumLock) {
      state.openPages.clear();
      state.pageSizes.clear();
      state.layoutSizes.clear();
      if (state.document != null) {
        try {
          state.pdfium.closeDocument(state.document);
        } catch (Throwable ignored) {
        }
        state.document = null;
      }
      if (state.fileDescriptor != null) {
        try {
          state.fileDescriptor.close();
        } catch (IOException ignored) {
        }
        state.fileDescriptor = null;
      }
      state.sourcePath = null;
    }
  }

  static void setDocument(EngineState state, PdfDocument document, ParcelFileDescriptor fd, String sourcePath) {
    synchronized (state.pdfiumLock) {
      closeDocument(state);
      state.document = document;
      state.fileDescriptor = fd;
      state.sourcePath = sourcePath;
    }
  }

  /**
   * A page opened in pdfium stays in native memory until the document closes:
   * the library has no public way to close one. A reader that opened every
   * page to lay the document out (or to search it) kept all of them, hundreds
   * of megabytes for a long book. Pages are now opened through
   * {@link #acquirePage} and {@link #pageSizePoints}, which keep at most
   * {@link #MAX_OPEN_PAGES} of them.
   */
  static final int MAX_OPEN_PAGES = 6;

  private static volatile boolean closeLookupDone = false;
  private static Field nativePagesField;
  private static Method nativeClosePageMethod;

  private static void lookupClose() {
    if (closeLookupDone) return;
    synchronized (PapyrusEngineStore.class) {
      if (closeLookupDone) return;
      try {
        Field field = PdfDocument.class.getDeclaredField("mNativePagesPtr");
        field.setAccessible(true);
        Method method = PdfiumCore.class.getDeclaredMethod("nativeClosePage", long.class);
        method.setAccessible(true);
        nativePagesField = field;
        nativeClosePageMethod = method;
      } catch (Throwable ignored) {
        // A pdfium build without these names: pages stay open until the
        // document closes, as before.
      }
      closeLookupDone = true;
    }
  }

  static boolean canClosePages() {
    lookupClose();
    return nativeClosePageMethod != null;
  }

  /** Call with {@code state.pdfiumLock} held. */
  @SuppressWarnings("unchecked")
  private static void closePageLocked(EngineState state, int pageIndex) {
    state.openPages.remove(pageIndex);
    lookupClose();
    if (nativeClosePageMethod == null || state.document == null) return;
    try {
      Map<Integer, Long> pages = (Map<Integer, Long>) nativePagesField.get(state.document);
      Long pointer = pages == null ? null : pages.remove(pageIndex);
      if (pointer != null) nativeClosePageMethod.invoke(state.pdfium, pointer.longValue());
    } catch (Throwable ignored) {
    }
  }

  /**
   * Opens a page for drawing or for reading its text, and closes the least
   * recently used ones beyond the limit. Hold {@code state.pdfiumLock} from
   * this call until the page has been used.
   */
  static void acquirePage(EngineState state, int pageIndex) {
    synchronized (state.pdfiumLock) {
      if (state.document == null) return;
      try {
        state.pdfium.openPage(state.document, pageIndex);
      } catch (Throwable ignored) {
        return;
      }
      state.openPages.put(pageIndex, Boolean.TRUE);
      Iterator<Integer> oldest = state.openPages.keySet().iterator();
      while (state.openPages.size() > MAX_OPEN_PAGES && oldest.hasNext()) {
        int candidate = oldest.next();
        if (candidate == pageIndex) continue;
        oldest.remove();
        closePageLocked(state, candidate);
        oldest = state.openPages.keySet().iterator();
      }
    }
  }

  /** Width and height of a page in points; the page is not left open. */
  static int[] pageSizePoints(EngineState state, int pageIndex) {
    int[] cached = state.pageSizes.get(pageIndex);
    if (cached != null) return cached;
    synchronized (state.pdfiumLock) {
      if (state.document == null) return new int[] {0, 0};
      cached = state.pageSizes.get(pageIndex);
      if (cached != null) return cached;
      boolean wasOpen = state.document.hasPage(pageIndex);
      int width = 0;
      int height = 0;
      try {
        if (!wasOpen) state.pdfium.openPage(state.document, pageIndex);
        width = state.pdfium.getPageWidthPoint(state.document, pageIndex);
        height = state.pdfium.getPageHeightPoint(state.document, pageIndex);
      } catch (Throwable ignored) {
      } finally {
        if (!wasOpen) closePageLocked(state, pageIndex);
      }
      int[] size = new int[] {width, height};
      if (width > 0 && height > 0) state.pageSizes.put(pageIndex, size);
      return size;
    }
  }

  /**
   * Page size for laying the whole document out, WITHOUT loading the page:
   * pdfium reads it from the page dictionary. Loading every page to measure
   * it (even closing it right after) leaves each page's parsed objects in the
   * document's cache until it closes, ~200 MB for a 1,400-page book.
   *
   * The library reports this size in device pixels, so the value in points
   * can be off by one. A page that has already been measured exactly (it was
   * drawn, or asked for by {@link #pageSizePoints}) uses the exact value.
   */
  static int[] layoutPageSizePoints(EngineState state, int pageIndex) {
    int[] exact = state.pageSizes.get(pageIndex);
    if (exact != null) return exact;
    int[] cached = state.layoutSizes.get(pageIndex);
    if (cached != null) return cached;
    synchronized (state.pdfiumLock) {
      if (state.document == null) return new int[] {0, 0};
      int width = 0;
      int height = 0;
      try {
        com.shockwave.pdfium.util.Size size = state.pdfium.getPageSize(state.document, pageIndex);
        width = Math.round(size.getWidth() * 72f / state.densityDpi);
        height = Math.round(size.getHeight() * 72f / state.densityDpi);
      } catch (Throwable ignored) {
      }
      if (width <= 0 || height <= 0) return pageSizePoints(state, pageIndex);
      int[] result = new int[] {width, height};
      state.layoutSizes.put(pageIndex, result);
      return result;
    }
  }
}
