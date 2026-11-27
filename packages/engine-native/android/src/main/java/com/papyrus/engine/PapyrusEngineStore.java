package com.papyrus.engine;

import android.content.Context;
import android.os.ParcelFileDescriptor;

import com.shockwave.pdfium.PdfDocument;
import com.shockwave.pdfium.PdfiumCore;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
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
    /**
     * Pages that are still open in pdfium because closing them failed (or is
     * not possible on this pdfium build). Counted apart so the stats never
     * claim memory that was not released.
     */
    final java.util.Set<Integer> retainedPages = new java.util.HashSet<>();
    /** True while the document was released on purpose and can be reopened from {@code sourcePath}. */
    boolean suspended = false;
    /**
     * Changes when a different document is set or the document is closed for
     * good, NOT when the same file is reopened (suspend/resume, recycling):
     * views use it to tell "another document" from "same document, new
     * pdfium handle".
     */
    volatile int documentGeneration = 0;
    /** Pages loaded since the pdfium document was (re)opened, and the native heap at that moment. */
    int pagesLoadedSinceOpen = 0;
    long nativeHeapAtOpen = 0;
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

  /** Every page still open in pdfium, including the ones that could not be closed. */
  static int openPageCount() {
    int count = 0;
    for (EngineState state : ENGINES.values()) {
      synchronized (state.pdfiumLock) {
        count += state.openPages.size() + state.retainedPages.size();
      }
    }
    return count;
  }

  /** Pages left open because closing failed: above zero means memory is being held. */
  static int retainedPageCount() {
    int count = 0;
    for (EngineState state : ENGINES.values()) {
      synchronized (state.pdfiumLock) {
        count += state.retainedPages.size();
      }
    }
    return count;
  }

  static int suspendedDocumentCount() {
    int count = 0;
    for (EngineState state : ENGINES.values()) {
      if (state.suspended) count++;
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
      releaseDocumentLocked(state);
      state.pageSizes.clear();
      state.layoutSizes.clear();
      state.sourcePath = null;
      state.suspended = false;
      state.documentGeneration++;
    }
  }

  /** Documents whose close threw: their native memory may still be held. */
  private static final java.util.concurrent.atomic.AtomicInteger FAILED_DOCUMENT_CLOSES = new java.util.concurrent.atomic.AtomicInteger();
  /** Pages that were open in a document whose close threw. */
  private static final java.util.concurrent.atomic.AtomicInteger LEAKED_PAGES = new java.util.concurrent.atomic.AtomicInteger();

  static int failedDocumentCloseCount() {
    return FAILED_DOCUMENT_CLOSES.get();
  }

  static int leakedPageCount() {
    return LEAKED_PAGES.get();
  }

  /**
   * Closes the pdfium document and its file; pdfium frees every page with it.
   * The page counters are cleared only after the close succeeded. If it
   * throws, the document is dropped anyway (it cannot be trusted any more),
   * but its pages are added to the leak counters instead of being reported
   * as released. Returns whether everything was released.
   */
  private static boolean releaseDocumentLocked(EngineState state) {
    boolean released = true;
    if (state.document != null) {
      try {
        state.pdfium.closeDocument(state.document);
      } catch (Throwable error) {
        released = false;
        FAILED_DOCUMENT_CLOSES.incrementAndGet();
        LEAKED_PAGES.addAndGet(state.openPages.size() + state.retainedPages.size());
        android.util.Log.w("PapyrusEngine", "closeDocument failed; native memory may be held", error);
      }
      state.document = null;
    }
    // Reached with the document gone either way: these now describe nothing.
    state.openPages.clear();
    state.retainedPages.clear();
    if (state.fileDescriptor != null) {
      try {
        // pdfium-android closes the descriptor with the document; closing it
        // again is harmless and covers a close that threw half-way.
        state.fileDescriptor.close();
      } catch (IOException error) {
        android.util.Log.w("PapyrusEngine", "closing the document file failed", error);
      }
      state.fileDescriptor = null;
    }
    return released;
  }

  private static void markOpenedLocked(EngineState state) {
    state.pagesLoadedSinceOpen = 0;
    state.nativeHeapAtOpen = android.os.Debug.getNativeHeapAllocatedSize();
  }

  /**
   * pdfium keeps what every page it has loaded parsed (and the image streams
   * it decoded) in a document-level cache with no limit and no public way to
   * trim it: closing pages does not shrink it. Reading 300 scanned pages kept
   * 385 MB with six pages open. The only release is closing the document, so
   * a long session reopens it from its file when the cache has grown past
   * these limits (2–30 ms, between two page loads, under the engine lock).
   */
  static final int RECYCLE_MIN_PAGES = 24;
  static final int RECYCLE_AFTER_PAGES = 400;
  static final long RECYCLE_AFTER_BYTES = 96L * 1024 * 1024;
  private static final java.util.concurrent.atomic.AtomicInteger DOCUMENT_RECYCLES = new java.util.concurrent.atomic.AtomicInteger();

  static int documentRecycleCount() {
    return DOCUMENT_RECYCLES.get();
  }

  /** Call with {@code state.pdfiumLock} held and no page of this document in use. */
  private static void recycleIfGrownLocked(EngineState state) {
    if (state.document == null || state.sourcePath == null) return;
    if (state.pagesLoadedSinceOpen < RECYCLE_MIN_PAGES) return;
    long grown = android.os.Debug.getNativeHeapAllocatedSize() - state.nativeHeapAtOpen;
    if (state.pagesLoadedSinceOpen < RECYCLE_AFTER_PAGES && grown < RECYCLE_AFTER_BYTES) return;
    releaseDocumentLocked(state);
    try {
      ParcelFileDescriptor fd = ParcelFileDescriptor.open(new File(state.sourcePath), ParcelFileDescriptor.MODE_READ_ONLY);
      try {
        state.document = state.pdfium.newDocument(fd);
        state.fileDescriptor = fd;
      } catch (IOException | RuntimeException error) {
        fd.close();
        throw error;
      }
      markOpenedLocked(state);
      DOCUMENT_RECYCLES.incrementAndGet();
    } catch (Throwable error) {
      // The file is gone or unreadable: leave the engine as "suspended" so a
      // later resume can try again, instead of pretending a document is open.
      state.suspended = true;
      android.util.Log.w("PapyrusEngine", "could not reopen the document while recycling", error);
    }
  }

  /**
   * Releases the document while the reader is not on screen, keeping what is
   * needed to open it again: the file path and the measured page sizes. The
   * reading position, progress and annotations live outside the engine and
   * are not touched.
   */
  static boolean suspendDocument(EngineState state) {
    synchronized (state.pdfiumLock) {
      if (state.document == null || state.sourcePath == null) return false;
      boolean released = releaseDocumentLocked(state);
      state.suspended = true;
      return released;
    }
  }

  /** Reopens a suspended document. Returns false when there is nothing to reopen. */
  static boolean resumeDocument(EngineState state) throws IOException {
    synchronized (state.pdfiumLock) {
      if (state.document != null) return true;
      if (!state.suspended || state.sourcePath == null) return false;
      ParcelFileDescriptor fd = ParcelFileDescriptor.open(new File(state.sourcePath), ParcelFileDescriptor.MODE_READ_ONLY);
      try {
        state.document = state.pdfium.newDocument(fd);
        state.fileDescriptor = fd;
        state.suspended = false;
        markOpenedLocked(state);
        return true;
      } catch (IOException | RuntimeException error) {
        try {
          fd.close();
        } catch (IOException ignored) {
        }
        throw error;
      }
    }
  }

  static void setDocument(EngineState state, PdfDocument document, ParcelFileDescriptor fd, String sourcePath) {
    synchronized (state.pdfiumLock) {
      closeDocument(state);
      state.document = document;
      state.fileDescriptor = fd;
      state.sourcePath = sourcePath;
      markOpenedLocked(state);
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

  /**
   * Call with {@code state.pdfiumLock} held. Returns whether the page is
   * really closed in pdfium. A page that could not be closed moves to
   * {@code retainedPages}: it is still counted, and never reported as freed.
   */
  @SuppressWarnings("unchecked")
  private static boolean closePageLocked(EngineState state, int pageIndex) {
    if (state.document == null) {
      state.openPages.remove(pageIndex);
      state.retainedPages.remove(pageIndex);
      return true;
    }
    boolean closed = false;
    lookupClose();
    if (nativeClosePageMethod != null) {
      try {
        Map<Integer, Long> pages = (Map<Integer, Long>) nativePagesField.get(state.document);
        Long pointer = pages == null ? null : pages.get(pageIndex);
        if (pointer == null) {
          // pdfium does not have it open: nothing to release.
          closed = pages != null;
        } else {
          nativeClosePageMethod.invoke(state.pdfium, pointer.longValue());
          // Forget the pointer only after pdfium released it.
          pages.remove(pageIndex);
          closed = true;
        }
      } catch (Throwable ignored) {
        closed = false;
      }
    }
    state.openPages.remove(pageIndex);
    if (closed) state.retainedPages.remove(pageIndex);
    else state.retainedPages.add(pageIndex);
    return closed;
  }

  /**
   * Opens a page for drawing or for reading its text, and closes the least
   * recently used ones beyond the limit. Hold {@code state.pdfiumLock} from
   * this call until the page has been used, and read {@code state.document}
   * AFTER it: a long session may have reopened the document here.
   */
  static void acquirePage(EngineState state, int pageIndex) {
    synchronized (state.pdfiumLock) {
      if (state.document == null) return;
      if (!state.openPages.containsKey(pageIndex)) recycleIfGrownLocked(state);
      if (state.document == null) return;
      boolean wasOpen = state.document.hasPage(pageIndex);
      try {
        state.pdfium.openPage(state.document, pageIndex);
      } catch (Throwable ignored) {
        return;
      }
      if (!wasOpen) state.pagesLoadedSinceOpen++;
      state.retainedPages.remove(pageIndex);
      state.openPages.put(pageIndex, Boolean.TRUE);
      while (state.openPages.size() > MAX_OPEN_PAGES) {
        Integer candidate = null;
        for (Integer index : state.openPages.keySet()) {
          if (index != pageIndex) {
            candidate = index;
            break;
          }
        }
        if (candidate == null) break;
        // On failure the page leaves the LRU for `retainedPages`, so this
        // loop always ends and the page is not asked to close again.
        closePageLocked(state, candidate);
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
