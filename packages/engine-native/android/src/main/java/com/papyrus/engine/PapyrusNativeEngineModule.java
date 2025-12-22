package com.papyrus.engine;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
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
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class PapyrusNativeEngineModule extends ReactContextBaseJavaModule {
  private final ReactApplicationContext reactContext;
  private final ExecutorService executor = Executors.newSingleThreadExecutor();

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

  @ReactMethod
  public void destroyEngine(String engineId) {
    PapyrusEngineStore.destroyEngine(engineId);
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

  @ReactMethod
  public void renderPage(final String engineId, final int pageIndex, final int target, final float scale, final float zoom, final int rotation) {
    final PapyrusEngineStore.EngineState state = PapyrusEngineStore.getEngine(engineId);
    if (state == null) return;
    UIManagerModule uiManager = reactContext.getNativeModule(UIManagerModule.class);
    if (uiManager == null) return;

    uiManager.addUIBlock(new UIBlock() {
      @Override
      public void execute(com.facebook.react.uimanager.NativeViewHierarchyManager nativeViewHierarchyManager) {
        View view = nativeViewHierarchyManager.resolveView(target);
        if (view instanceof PapyrusPageView) {
          ((PapyrusPageView) view).render(state, pageIndex, scale, zoom, rotation);
        }
      }
    });
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
  public void getPageIndex(String engineId, Object dest, Promise promise) {
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
  public void selectText(String engineId, int pageIndex, double x, double y, double width, double height, Promise promise) {
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
            selection = PapyrusTextSelect.nativeSelectTextFile(state.sourcePath, pageIndex, (float) x, (float) y, (float) width, (float) height);
          }
        } else {
          long docPtr;
          synchronized (state.pdfiumLock) {
            docPtr = extractNativeDocPointer(state.document);
          }
          if (docPtr != 0) {
            synchronized (state.pdfiumLock) {
              selection = PapyrusTextSelect.nativeSelectText(docPtr, pageIndex, (float) x, (float) y, (float) width, (float) height);
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
    if (source.hasKey("uri") && source.getType("uri") == ReadableType.String) {
      String uriString = source.getString("uri");
      if (uriString == null) return null;

      if (uriString.startsWith("http://") || uriString.startsWith("https://")) {
        return downloadToCache(uriString, context);
      }

      if (uriString.startsWith("asset:/")) {
        return copyFromAsset(uriString.substring("asset:/".length()), context);
      }

      if (uriString.startsWith("file:///android_asset/")) {
        return copyFromAsset(uriString.substring("file:///android_asset/".length()), context);
      }

      if (uriString.startsWith("content://")) {
        return copyFromContentUri(Uri.parse(uriString), context);
      }

      if (uriString.startsWith("file://")) {
        return new File(Uri.parse(uriString).getPath());
      }

      return new File(uriString);
    }

    if (source.hasKey("data") && source.getType("data") == ReadableType.Array) {
      ReadableArray array = source.getArray("data");
      if (array == null) return null;
      byte[] bytes = new byte[array.size()];
      for (int i = 0; i < array.size(); i++) {
        bytes[i] = (byte) array.getInt(i);
      }
      return writeBytesToCache(bytes, context);
    }

    return null;
  }

  private static File downloadToCache(String uri, Context context) throws IOException {
    URL url = new URL(uri);
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.connect();
    if (connection.getResponseCode() >= 400) {
      throw new IOException("Failed to download PDF");
    }
    InputStream inputStream = connection.getInputStream();
    File out = createTempFile(context);
    writeStreamToFile(inputStream, out);
    connection.disconnect();
    return out;
  }

  private static File copyFromContentUri(Uri uri, Context context) throws IOException {
    ContentResolver resolver = context.getContentResolver();
    InputStream inputStream = resolver.openInputStream(uri);
    if (inputStream == null) throw new IOException("Unable to read content URI");
    File out = createTempFile(context);
    writeStreamToFile(inputStream, out);
    return out;
  }

  private static File copyFromAsset(String assetPath, Context context) throws IOException {
    InputStream inputStream = context.getAssets().open(assetPath);
    File out = createTempFile(context);
    writeStreamToFile(inputStream, out);
    return out;
  }

  private static File writeBytesToCache(byte[] bytes, Context context) throws IOException {
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

  private static void writeStreamToFile(InputStream inputStream, File out) throws IOException {
    FileOutputStream fos = new FileOutputStream(out);
    byte[] buffer = new byte[8192];
    int read;
    while ((read = inputStream.read(buffer)) != -1) {
      fos.write(buffer, 0, read);
    }
    fos.flush();
    fos.close();
    inputStream.close();
  }
}
