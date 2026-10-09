package com.papyrus.engine;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.view.View;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.ReadableType;
import com.facebook.react.uimanager.UIBlock;
import com.facebook.react.uimanager.UIManagerModule;

import com.shockwave.pdfium.PdfDocument;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PapyrusNativeEngineModule extends ReactContextBaseJavaModule {
  private static final Object COMIC_THUMBNAIL_CACHE_LOCK = new Object();
  private static final long MAX_COMIC_THUMBNAIL_CACHE_BYTES = 16L * 1024L * 1024L;
  private static final long MAX_TEXT_SOURCE_BYTES = 64L * 1024L * 1024L;
  private static final long MAX_COMIC_ARCHIVE_BYTES = 512L * 1024L * 1024L;
  private final ReactApplicationContext reactContext;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private final ConcurrentHashMap<String, File> comicSourceFiles = new ConcurrentHashMap<>();
  private long renderRequestCounter = 0;

  public PapyrusNativeEngineModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "PapyrusNativeEngine";
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public String createEngine() {
    return PapyrusEngineStore.createEngine(reactContext);
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public boolean isTablet() {
    return reactContext.getResources().getConfiguration().smallestScreenWidthDp
      >= PapyrusRenderMath.TABLET_SMALLEST_WIDTH_DP;
  }

  @ReactMethod
  public void destroyEngine(String engineId) {
    PapyrusEngineStore.destroyEngine(engineId);
    PapyrusTextStore.close(engineId);
    PapyrusComicArchiveNative.closeEngine(engineId);
    String prefix = engineId + ":";
    for (java.util.Map.Entry<String, File> entry : comicSourceFiles.entrySet()) {
      if (entry.getKey().startsWith(prefix) && comicSourceFiles.remove(entry.getKey(), entry.getValue())) {
        entry.getValue().delete();
      }
    }
  }

  @ReactMethod
  public void loadText(String engineId, int generation, ReadableMap source, Promise promise) {
    executor.execute(() -> {
      File ownedFile = null;
      try {
        String text;
        if (source.hasKey("text") && source.getType("text") == ReadableType.String) {
          text = source.getString("text");
          if (text != null && utf8LengthExceeds(text, MAX_TEXT_SOURCE_BYTES)) {
            throw new IOException("TXT source exceeds the 64 MiB limit");
          }
        } else {
          File file = materializeSource(source, reactContext, MAX_TEXT_SOURCE_BYTES);
          if (file == null) throw new IOException("Unsupported TXT source");
          if (isOwnedMaterializedSource(source)) ownedFile = file;
          try (FileInputStream input = new FileInputStream(file)) {
            text = PapyrusNativeTextModel.decode(readAllBytes(input, MAX_TEXT_SOURCE_BYTES));
          }
        }
        if (text == null) throw new IOException("TXT source did not contain text");
        PapyrusTextStore.setText(engineId, generation, text);
        WritableMap result = Arguments.createMap();
        result.putInt("textLength", text.length());
        promise.resolve(result);
      } catch (Throwable error) {
        promise.reject("papyrus_text_load_failed", error.getMessage() != null ? error.getMessage() : "Failed to load TXT", error);
      } finally {
        if (ownedFile != null) ownedFile.delete();
      }
    });
  }

  @ReactMethod
  public void closeText(String engineId, int generation) {
    PapyrusTextStore.close(engineId, generation);
  }

  @ReactMethod
  public void getTextRange(String engineId, int generation, int start, int end, Promise promise) {
    String text = PapyrusTextStore.getText(engineId, generation);
    if (text == null || start < 0 || end < start || end > text.length()) {
      promise.resolve("");
      return;
    }
    promise.resolve(text.substring(start, end));
  }

  @ReactMethod
  public void resolveTextAnnotationRange(String engineId,int generation,ReadableMap anchor,Promise promise) {
    executor.execute(()->{
      try {
        String text=PapyrusTextStore.getText(engineId,generation);
        int[] range=PapyrusTextAnnotationModel.resolve(text,anchor.getInt("start"),anchor.getInt("end"),anchor.getString("quote"),anchor.hasKey("prefix")&&!anchor.isNull("prefix")?anchor.getString("prefix"):null,anchor.hasKey("suffix")&&!anchor.isNull("suffix")?anchor.getString("suffix"):null);
        if(range==null){promise.resolve(null);return;}
        WritableMap result=Arguments.createMap();result.putInt("start",range[0]);result.putInt("end",range[1]);promise.resolve(result);
      } catch(Exception error){promise.reject("papyrus_text_anchor_invalid",error);}
    });
  }

  @ReactMethod
  public void searchTextRanges(String engineId, int generation, String query, Promise promise) {
    executor.execute(() -> {
      try {
        String text = PapyrusTextStore.getText(engineId, generation);
        List<PapyrusNativeTextModel.SearchMatch> matches = text == null
          ? java.util.Collections.emptyList()
          : PapyrusNativeTextModel.search(text, query == null ? "" : query);
        WritableArray payload = Arguments.createArray();
        for (PapyrusNativeTextModel.SearchMatch match : matches) {
          WritableMap location = Arguments.createMap();
          location.putString("kind", "textRange");
          location.putInt("start", match.start);
          location.putInt("end", match.end);
          WritableMap item = Arguments.createMap();
          item.putString("kind", "text");
          item.putMap("location", location);
          item.putString("text", match.text);
          item.putInt("matchIndex", match.matchIndex);
          payload.pushMap(item);
        }
        promise.resolve(payload);
      } catch (Throwable error) {
        promise.reject("papyrus_text_search_failed", error.getMessage() != null ? error.getMessage() : "Failed to search TXT", error);
      }
    });
  }

  @ReactMethod
  public void loadComic(String engineId, int generation, ReadableMap source, String format, Promise promise) {
    executor.execute(() -> {
      File ownedFile = null;
      try {
        File archive = materializeSource(source, reactContext, MAX_COMIC_ARCHIVE_BYTES);
        if (archive == null) throw new IOException("Unsupported comic source");
        if (isOwnedMaterializedSource(source)) ownedFile = archive;
        File cache = new File(reactContext.getCacheDir(), "papyrus-comic-pages");
        int pageCount = PapyrusComicArchiveNative.open(engineId, generation, archive.getAbsolutePath(), cache.getAbsolutePath());
        if (ownedFile != null) comicSourceFiles.put(comicSourceKey(engineId, generation), ownedFile);
        WritableMap result = Arguments.createMap();
        result.putInt("pageCount", pageCount);
        promise.resolve(result);
      } catch (Throwable error) {
        if (ownedFile != null) ownedFile.delete();
        promise.reject("papyrus_comic_load_failed", error.getMessage() != null ? error.getMessage() : "Failed to load comic archive", error);
      }
    });
  }

  @ReactMethod
  public void closeComic(String engineId, int generation) {
    PapyrusComicArchiveNative.close(engineId, generation);
    File source = comicSourceFiles.remove(comicSourceKey(engineId, generation));
    if (source != null) source.delete();
  }

  @ReactMethod
  public void getComicPagePreview(String engineId, int generation, int pageIndex, int maxEdge, Promise promise) {
    executor.execute(() -> {
      Bitmap bitmap = null;
      try {
        String path = PapyrusComicArchiveNative.extractPage(engineId, generation, pageIndex);
        File sourceFile = new File(path);
        int limit = Math.max(64, Math.min(1024, maxEdge));
        File thumbnailDirectory = new File(reactContext.getCacheDir(), "papyrus-comic-pages/thumbnails");
        if (!thumbnailDirectory.exists() && !thumbnailDirectory.mkdirs()) {
          promise.resolve(null);
          return;
        }
        File thumbnailFile = new File(thumbnailDirectory, sourceFile.getName() + "-" + limit + ".jpg");
        synchronized (COMIC_THUMBNAIL_CACHE_LOCK) {
          if (thumbnailFile.isFile() && thumbnailFile.length() > 0) {
            thumbnailFile.setLastModified(System.currentTimeMillis());
            promise.resolve(Uri.fromFile(thumbnailFile).toString());
            return;
          }
        }
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(sourceFile.getAbsolutePath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 20000 || bounds.outHeight > 20000 ||
            (long) bounds.outWidth * (long) bounds.outHeight > 80000000L) {
          promise.resolve(null);
          return;
        }
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / sample > limit ||
            ((long) bounds.outWidth / sample) * ((long) bounds.outHeight / sample) > 8000000L) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        bitmap = BitmapFactory.decodeFile(sourceFile.getAbsolutePath(), options);
        if (bitmap == null) { promise.resolve(null); return; }
        synchronized (COMIC_THUMBNAIL_CACHE_LOCK) {
          if (!thumbnailFile.isFile() || thumbnailFile.length() == 0) {
            try (FileOutputStream output = new FileOutputStream(thumbnailFile)) {
              if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output)) {
                thumbnailFile.delete();
                promise.resolve(null);
                return;
              }
            }
          }
          pruneComicThumbnailCache(thumbnailDirectory, thumbnailFile);
          promise.resolve(Uri.fromFile(thumbnailFile).toString());
        }
      } catch (Throwable ignored) {
        promise.resolve(null);
      } finally {
        if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
      }
    });
  }

  private static void pruneComicThumbnailCache(File directory, File preserve) {
    File[] files = directory.listFiles(File::isFile);
    if (files == null) return;
    long total = 0;
    for (File file : files) total += file.length();
    Arrays.sort(files, Comparator.comparingLong(File::lastModified));
    for (File file : files) {
      if (total <= MAX_COMIC_THUMBNAIL_CACHE_BYTES) break;
      if (file.equals(preserve)) continue;
      long size = file.length();
      if (file.delete()) total -= size;
    }
  }

  private static String comicSourceKey(String engineId, int generation) {
    return engineId + ":" + generation;
  }

  private static boolean isOwnedMaterializedSource(ReadableMap source) {
    if (source.hasKey("data")) return true;
    if (!source.hasKey("uri") || source.getType("uri") != ReadableType.String) return false;
    String uri = source.getString("uri");
    return uri != null && (uri.startsWith("http://") || uri.startsWith("https://") ||
      uri.startsWith("content://") || uri.startsWith("asset:/") ||
      uri.startsWith("file:///android_asset/") || uri.startsWith("res://"));
  }

  private static byte[] readAllBytes(InputStream input, long maxBytes) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int count;
    long total = 0;
    while ((count = input.read(buffer)) != -1) {
      total += count;
      if (total > maxBytes) throw new IOException("TXT source exceeds the 64 MiB limit");
      output.write(buffer, 0, count);
    }
    return output.toByteArray();
  }

  private static boolean utf8LengthExceeds(String value, long maxBytes) {
    long bytes = 0;
    for (int i = 0; i < value.length(); i++) {
      char current = value.charAt(i);
      if (current <= 0x7f) bytes += 1;
      else if (current <= 0x7ff) bytes += 2;
      else if (Character.isHighSurrogate(current) && i + 1 < value.length() && Character.isLowSurrogate(value.charAt(i + 1))) {
        bytes += 4;
        i++;
      } else bytes += 3;
      if (bytes > maxBytes) return true;
    }
    return false;
  }

  @ReactMethod
  public void readFileChunk(String uriValue, double offsetValue, int length, Promise promise) {
    executor.execute(() -> {
      try {
        if (length <= 0 || length > 4 * 1024 * 1024) {
          throw new IOException("Invalid file chunk length");
        }

        Uri uri = Uri.parse(uriValue);
        InputStream inputStream;
        if ("file".equalsIgnoreCase(uri.getScheme())) {
          inputStream = new FileInputStream(new File(uri.getPath()));
        } else if ("content".equalsIgnoreCase(uri.getScheme())) {
          ContentResolver resolver = reactContext.getContentResolver();
          inputStream = resolver.openInputStream(uri);
          if (inputStream == null) throw new IOException("Unable to read content URI");
        } else if ("android.resource".equalsIgnoreCase(uri.getScheme())) {
          ContentResolver resolver = reactContext.getContentResolver();
          inputStream = resolver.openInputStream(uri);
          if (inputStream == null) throw new IOException("Unable to read Android resource URI");
        } else {
          throw new IOException("Unsupported local file URI");
        }

        try (InputStream stream = inputStream) {
          long remaining = Math.max(0L, (long) offsetValue);
          while (remaining > 0) {
            long skipped = stream.skip(remaining);
            if (skipped <= 0) {
              if (stream.read() < 0) break;
              skipped = 1;
            }
            remaining -= skipped;
          }

          byte[] buffer = new byte[length];
          int read = 0;
          while (read < length) {
            int count = stream.read(buffer, read, length - read);
            if (count < 0) break;
            if (count == 0) continue;
            read += count;
          }

          WritableMap result = Arguments.createMap();
          result.putString("data", Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP));
          result.putBoolean("done", read < length);
          promise.resolve(result);
        }
      } catch (Throwable error) {
        promise.reject("papyrus_file_chunk_failed", error);
      }
    });
  }

  @ReactMethod
  public void load(final String engineId, final ReadableMap source, final Promise promise) {
    executor.execute(() -> {
      try {
        PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
        if (state == null) {
          promise.reject("papyrus_no_engine", "Engine not found");
          return;
        }

        File file = materializeSource(source, reactContext);
        if (file == null) {
          promise.reject("papyrus_invalid_source", "Unsupported PDF source");
          return;
        }

        ParcelFileDescriptor fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
        PdfDocument document = state.pdfium.newDocument(fd);
        PapyrusEngineStore.setDocument(state, document, fd, file.getAbsolutePath());

        int pageCount = state.pdfium.getPageCount(document);
        WritableMap result = Arguments.createMap();
        result.putInt("pageCount", pageCount);
        promise.resolve(result);
      } catch (Throwable error) {
        promise.reject("papyrus_load_failed", error);
      }
    });
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public int getPageCount(String engineId) {
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null) return 0;
    return state.pdfium.getPageCount(state.document);
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public WritableMap getLifecycleStats() {
    WritableMap result = Arguments.createMap();
    result.putInt("engineStates", PapyrusEngineStore.engineCount());
    result.putInt("loadedDocuments", PapyrusEngineStore.loadedDocumentCount());
    for (java.util.Map.Entry<String, Integer> entry : PapyrusPageView.lifecycleStats().entrySet()) {
      result.putInt(entry.getKey(), entry.getValue());
    }
    return result;
  }

  @ReactMethod
  public void renderPage(final String engineId, final int pageIndex, final int target, final float scale, final float zoom, final int rotation, final String requestId, final ReadableMap telemetryContext, final Promise promise) {
    final PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null) {
      promise.reject("papyrus_no_engine", "Engine not found");
      return;
    }
    UIManagerModule uiManager = reactContext.getNativeModule(UIManagerModule.class);
    if (uiManager == null) {
      promise.reject("papyrus_render_error", "UI manager unavailable");
      return;
    }

    final String resolvedRequestId = requestId == null || requestId.isEmpty()
      ? "native-render-" + (++renderRequestCounter)
      : requestId;
    final PapyrusNativeRenderTelemetry telemetry = PapyrusNativeRenderTelemetry.from(
      telemetryContext,
      resolvedRequestId,
      null,
      pageIndex,
      target,
      0
    );
    telemetry.emit("native.render.request");
    final PapyrusRenderCompletion completion = new PapyrusRenderCompletion(
      status -> resolveRenderPromise(promise, resolvedRequestId, status),
      error -> promise.reject("papyrus_render_error", error)
    );

    telemetry.emit("native.render.uiblock.enqueue");
    uiManager.addUIBlock(new UIBlock() {
      @Override
      public void execute(com.facebook.react.uimanager.NativeViewHierarchyManager nativeViewHierarchyManager) {
        telemetry.traceBegin("PapyrusRenderUiBlock");
        try {
          telemetry.emit("native.render.uiblock.start");
          View view = nativeViewHierarchyManager.resolveView(target);
          if (view instanceof PapyrusPageView) {
            telemetry.emit("native.render.uiblock.surface.resolved");
            ((PapyrusPageView) view).render(state, pageIndex, scale, zoom, rotation, completion, telemetry);
          } else {
            telemetry.emit("native.render.stale");
            completion.complete(PapyrusRenderCompletion.Status.STALE);
          }
        } finally {
          telemetry.traceEnd();
        }
      }
    });
  }

  private void resolveRenderPromise(Promise promise, String requestId, PapyrusRenderCompletion.Status status) {
    WritableMap result = Arguments.createMap();
    String value = status == PapyrusRenderCompletion.Status.READY
      ? "ready"
      : status == PapyrusRenderCompletion.Status.STALE ? "stale" : "cancelled";
    result.putString("status", value);
    result.putString("requestId", requestId);
    promise.resolve(result);
  }

  @ReactMethod
  public void renderTextLayer(String engineId, int pageIndex, int target, float scale, float zoom, int rotation) {
  }

  @ReactMethod
  public void getTextContent(String engineId, int pageIndex, Promise promise) {
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null) {
      promise.resolve(Arguments.createArray());
      return;
    }
    String text;
    synchronized (state.pdfiumLock) {
      text = extractPageText(state, pageIndex);
    }
    WritableArray items = Arguments.createArray();
    if (text != null && !text.isEmpty()) {
      WritableMap item = Arguments.createMap();
      item.putString("str", text);
      item.putString("dir", "ltr");
      item.putDouble("width", 0);
      item.putDouble("height", 0);
      WritableArray transform = Arguments.createArray();
      transform.pushDouble(1);
      transform.pushDouble(0);
      transform.pushDouble(0);
      transform.pushDouble(1);
      transform.pushDouble(0);
      transform.pushDouble(0);
      item.putArray("transform", transform);
      item.putString("fontName", "");
      items.pushMap(item);
    }
    promise.resolve(items);
  }

  @ReactMethod
  public void getPageDimensions(String engineId, int pageIndex, Promise promise) {
    PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null || state.document == null) {
      WritableMap result = Arguments.createMap();
      result.putInt("width", 0);
      result.putInt("height", 0);
      promise.resolve(result);
      return;
    }
    int width;
    int height;
    synchronized (state.pdfiumLock) {
      try {
        state.pdfium.openPage(state.document, pageIndex);
      } catch (Throwable ignored) {
      }
      width = state.pdfium.getPageWidthPoint(state.document, pageIndex);
      height = state.pdfium.getPageHeightPoint(state.document, pageIndex);
    }
    WritableMap result = Arguments.createMap();
    result.putInt("width", width);
    result.putInt("height", height);
    promise.resolve(result);
  }

  @ReactMethod
  public void getOutline(String engineId, Promise promise) {
    executor.execute(() -> {
      PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
      if (state == null || state.document == null) {
        promise.resolve(Arguments.createArray());
        return;
      }

      PapyrusOutlineItem[] items = null;
      try {
        if (PapyrusOutline.AVAILABLE) {
          if (state.sourcePath != null && !state.sourcePath.isEmpty()) {
            synchronized (state.pdfiumLock) {
              items = PapyrusOutline.nativeGetOutlineFile(state.sourcePath);
            }
          } else {
            long docPtr;
            synchronized (state.pdfiumLock) {
              docPtr = extractNativeDocPointer(state.document);
            }
            if (docPtr != 0) {
              synchronized (state.pdfiumLock) {
                items = PapyrusOutline.nativeGetOutline(docPtr);
              }
            }
          }
        }
      } catch (Throwable ignored) {
        items = null;
      }

      WritableArray result = Arguments.createArray();
      if (items != null) {
        for (PapyrusOutlineItem item : items) {
          result.pushMap(serializeOutlineItem(item));
        }
      }
      promise.resolve(result);
    });
  }

  @ReactMethod
  public void getPageIndex(String engineId, ReadableMap dest, Promise promise) {
    promise.resolve(null);
  }

  @ReactMethod
  public void searchText(String engineId, String query, Promise promise) {
    executor.execute(() -> {
      PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
      if (state == null || state.document == null || query == null || query.length() < 2) {
        promise.resolve(Arguments.createArray());
        return;
      }

      int pageCount = state.pdfium.getPageCount(state.document);
      state.isSearching = true;
      try {
        try {
          if (PapyrusTextSearch.AVAILABLE) {
            PapyrusTextHit[] hits = null;
            if (state.sourcePath != null && !state.sourcePath.isEmpty()) {
              synchronized (state.pdfiumLock) {
                hits = PapyrusTextSearch.nativeSearchFile(state.sourcePath, query);
              }
            } else {
              long docPtr;
              synchronized (state.pdfiumLock) {
                docPtr = extractNativeDocPointer(state.document);
              }
              if (docPtr != 0) {
                synchronized (state.pdfiumLock) {
                  hits = PapyrusTextSearch.nativeSearch(docPtr, pageCount, query);
                }
              }
            }

            if (hits != null && hits.length > 0) {
              WritableArray results = Arguments.createArray();
              for (PapyrusTextHit hit : hits) {
                WritableMap result = Arguments.createMap();
                result.putInt("pageIndex", hit.pageIndex);
                result.putString("text", hit.text != null ? hit.text : query);
                result.putInt("matchIndex", hit.matchIndex);
                if (hit.rects != null && hit.rects.length >= 4) {
                  WritableArray rects = Arguments.createArray();
                  for (int i = 0; i + 3 < hit.rects.length; i += 4) {
                    WritableMap rect = Arguments.createMap();
                    rect.putDouble("x", hit.rects[i]);
                    rect.putDouble("y", hit.rects[i + 1]);
                    rect.putDouble("width", hit.rects[i + 2]);
                    rect.putDouble("height", hit.rects[i + 3]);
                    rects.pushMap(rect);
                  }
                  result.putArray("rects", rects);
                }
                results.pushMap(result);
              }
              promise.resolve(results);
              return;
            }
          }
        } catch (Throwable ignored) {
        }

        String normalizedQuery = query.toLowerCase();
        WritableArray results = Arguments.createArray();

        for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
          String text;
          synchronized (state.pdfiumLock) {
            text = extractPageText(state, pageIndex);
          }
          if (text == null || text.isEmpty()) continue;

          String lower = text.toLowerCase();
          int pos = lower.indexOf(normalizedQuery);
          int matchIndex = 0;
          while (pos != -1) {
            int start = Math.max(0, pos - 20);
            int end = Math.min(text.length(), pos + normalizedQuery.length() + 20);
            String preview = text.substring(start, end);

            WritableMap result = Arguments.createMap();
            result.putInt("pageIndex", pageIndex);
            result.putString("text", preview);
            result.putInt("matchIndex", matchIndex++);
            results.pushMap(result);

            pos = lower.indexOf(normalizedQuery, pos + 1);
          }
        }

        promise.resolve(results);
      } finally {
        state.isSearching = false;
      }
    });
  }

  @ReactMethod
  public void selectText(String engineId, int pageIndex, double x, double y, double width, double height, double startX, double startY, double endX, double endY, Promise promise) {
    executor.execute(() -> {
      PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
      if (state == null || state.document == null || pageIndex < 0) {
        promise.resolve(null);
        return;
      }

      if (!PapyrusTextSelect.AVAILABLE) {
        promise.resolve(null);
        return;
      }

      PapyrusTextSelection selection = null;
      try {
        if (state.sourcePath != null && !state.sourcePath.isEmpty()) {
          synchronized (state.pdfiumLock) {
            selection = PapyrusTextSelect.nativeSelectTextFile(state.sourcePath, pageIndex, (float) x, (float) y, (float) width, (float) height, (float) startX, (float) startY, (float) endX, (float) endY);
          }
        } else {
          long docPtr;
          synchronized (state.pdfiumLock) {
            docPtr = extractNativeDocPointer(state.document);
          }
          if (docPtr != 0) {
            synchronized (state.pdfiumLock) {
              selection = PapyrusTextSelect.nativeSelectText(docPtr, pageIndex, (float) x, (float) y, (float) width, (float) height, (float) startX, (float) startY, (float) endX, (float) endY);
            }
          }
        }
      } catch (Throwable ignored) {
        selection = null;
      }

      if (selection == null || selection.rects == null || selection.rects.length == 0) {
        promise.resolve(null);
        return;
      }

      WritableMap result = Arguments.createMap();
      result.putString("text", selection.text != null ? selection.text : "");
      WritableArray rects = Arguments.createArray();
      for (int i = 0; i + 3 < selection.rects.length; i += 4) {
        WritableMap rect = Arguments.createMap();
        rect.putDouble("x", selection.rects[i]);
        rect.putDouble("y", selection.rects[i + 1]);
        rect.putDouble("width", selection.rects[i + 2]);
        rect.putDouble("height", selection.rects[i + 3]);
        rects.pushMap(rect);
      }
      result.putArray("rects", rects);
      promise.resolve(result);
    });
  }

  private String extractPageText(PapyrusEngineStore.EngineState state, int pageIndex) {
    try {
      state.pdfium.openPage(state.document, pageIndex);
    } catch (Throwable ignored) {
    }

    try {
      java.lang.reflect.Method method = null;
      try {
        method = state.pdfium.getClass().getDeclaredMethod("getPageText", PdfDocument.class, int.class);
      } catch (NoSuchMethodException ignored) {
      }

      if (method == null) {
        try {
          method = state.pdfium.getClass().getDeclaredMethod("nativeGetPageText", long.class, int.class);
        } catch (NoSuchMethodException ignored) {
        }
      }

      if (method != null) {
        method.setAccessible(true);
        Object result;
        if (method.getParameterTypes().length == 2 && method.getParameterTypes()[0] == PdfDocument.class) {
          result = method.invoke(state.pdfium, state.document, pageIndex);
        } else if (method.getParameterTypes().length == 2 && method.getParameterTypes()[0] == long.class) {
          long docPtr = extractNativeDocPointer(state.document);
          result = method.invoke(state.pdfium, docPtr, pageIndex);
        } else {
          result = null;
        }
        return result != null ? result.toString() : "";
      }
    } catch (Throwable ignored) {
    }

    return "";
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

  private WritableMap serializeOutlineItem(PapyrusOutlineItem item) {
    WritableMap map = Arguments.createMap();
    map.putString("title", item.title != null ? item.title : "");
    map.putInt("pageIndex", item.pageIndex);
    if (item.children != null && item.children.length > 0) {
      WritableArray children = Arguments.createArray();
      for (PapyrusOutlineItem child : item.children) {
        children.pushMap(serializeOutlineItem(child));
      }
      map.putArray("children", children);
    }
    return map;
  }

  private static File materializeSource(ReadableMap source, Context context) throws IOException {
    return materializeSource(source, context, Long.MAX_VALUE);
  }

  private static File materializeSource(ReadableMap source, Context context, long maxBytes) throws IOException {
    if (source.hasKey("uri") && source.getType("uri") == ReadableType.String) {
      String uriString = source.getString("uri");
      if (uriString == null) return null;

      if (uriString.startsWith("http://") || uriString.startsWith("https://")) {
        return downloadToCache(uriString, context, maxBytes);
      }

      if (uriString.startsWith("asset:/")) {
        return copyFromAsset(uriString.substring("asset:/".length()), context, maxBytes);
      }

      if (uriString.startsWith("file:///android_asset/")) {
        return copyFromAsset(uriString.substring("file:///android_asset/".length()), context, maxBytes);
      }

      if (uriString.startsWith("content://")) {
        return copyFromContentUri(Uri.parse(uriString), context, maxBytes);
      }

      if (uriString.startsWith("file://")) {
        return requireFileWithinLimit(new File(Uri.parse(uriString).getPath()), maxBytes);
      }

      if (uriString.startsWith("res://")) {
        String resourceName = uriString.substring("res://".length());
        File resourceFile = copyFromRawResource(resourceName, context, maxBytes);
        if (resourceFile != null) {
          return resourceFile;
        }
      }

      File resourceFile = copyFromRawResource(uriString, context, maxBytes);
      if (resourceFile != null) {
        return resourceFile;
      }

      return requireFileWithinLimit(new File(uriString), maxBytes);
    }

    if (source.hasKey("data") && source.getType("data") == ReadableType.Array) {
      ReadableArray array = source.getArray("data");
      if (array == null) return null;
      if (array.size() > maxBytes) throw new IOException("Document source exceeds the size limit");
      byte[] bytes = new byte[array.size()];
      for (int i = 0; i < array.size(); i++) {
        bytes[i] = (byte) array.getInt(i);
      }
      return writeBytesToCache(bytes, context, maxBytes);
    }

    return null;
  }

  private static File downloadToCache(String uri, Context context, long maxBytes) throws IOException {
    URL url = new URL(uri);
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    File out = createTempFile(context);
    try {
      connection.connect();
      if (connection.getResponseCode() >= 400) throw new IOException("Failed to download document");
      long contentLength = connection.getContentLengthLong();
      if (contentLength > maxBytes) throw new IOException("Document source exceeds the size limit");
      try (InputStream inputStream = connection.getInputStream()) {
        writeStreamToFile(inputStream, out, maxBytes);
      }
      return out;
    } catch (IOException error) {
      out.delete();
      throw error;
    } finally {
      connection.disconnect();
    }
  }

  private static File copyFromContentUri(Uri uri, Context context, long maxBytes) throws IOException {
    ContentResolver resolver = context.getContentResolver();
    InputStream inputStream = resolver.openInputStream(uri);
    if (inputStream == null) throw new IOException("Unable to read content URI");
    File out = createTempFile(context);
    writeStreamToFile(inputStream, out, maxBytes);
    return out;
  }

  private static File copyFromAsset(String assetPath, Context context, long maxBytes) throws IOException {
    InputStream inputStream = context.getAssets().open(assetPath);
    File out = createTempFile(context);
    writeStreamToFile(inputStream, out, maxBytes);
    return out;
  }

  private static File copyFromRawResource(String resourceName, Context context, long maxBytes) throws IOException {
    int resId = context.getResources().getIdentifier(resourceName, "raw", context.getPackageName());
    if (resId == 0) {
      return null;
    }
    InputStream inputStream = context.getResources().openRawResource(resId);
    File out = createTempFile(context);
    writeStreamToFile(inputStream, out, maxBytes);
    return out;
  }

  private static File writeBytesToCache(byte[] bytes, Context context, long maxBytes) throws IOException {
    if (bytes.length > maxBytes) throw new IOException("Document source exceeds the size limit");
    File out = createTempFile(context);
    FileOutputStream fos = new FileOutputStream(out);
    fos.write(bytes);
    fos.flush();
    fos.close();
    return out;
  }

  private static File createTempFile(Context context) throws IOException {
    File cacheDir = context.getCacheDir();
    return File.createTempFile("papyrus", ".pdf", cacheDir);
  }

  private static File requireFileWithinLimit(File file, long maxBytes) throws IOException {
    if (file.length() > maxBytes) throw new IOException("Document source exceeds the size limit");
    return file;
  }

  private static void writeStreamToFile(InputStream inputStream, File out, long maxBytes) throws IOException {
    long total = 0;
    try (InputStream source = inputStream; FileOutputStream output = new FileOutputStream(out)) {
      byte[] buffer = new byte[8192];
      int read;
      while ((read = source.read(buffer)) != -1) {
        total += read;
        if (total > maxBytes) throw new IOException("Document source exceeds the size limit");
        output.write(buffer, 0, read);
      }
      output.flush();
    } catch (IOException error) {
      out.delete();
      throw error;
    }
  }
}
