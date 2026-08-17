package com.papyrus.engine

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.view.View
import com.facebook.react.bridge.UiThreadUtil
import com.shockwave.pdfium.PdfDocument
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Uint8Array
import android.util.Base64
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.lang.reflect.Method
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class PapyrusNativeEngineModule : Module() {
  private val executor: ExecutorService = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("PapyrusNativeEngine")

    Function("createEngine") {
      val context = appContext.reactContext ?: return@Function "default"
      PapyrusEngineStore.createEngine(context)
    }

    Function("destroyEngine") { engineId: String ->
      PapyrusEngineStore.destroyEngine(engineId)
    }

    AsyncFunction("readFileChunk") { uriValue: String, offsetValue: Double, length: Int ->
      if (length <= 0 || length > 4 * 1024 * 1024) {
        throw IOException("Invalid file chunk length")
      }

      val uri = Uri.parse(uriValue)
      val inputStream: InputStream = when (uri.scheme?.lowercase()) {
        "file" -> FileInputStream(File(uri.path ?: throw IOException("Invalid file URI")))
        "content" -> {
          val context = appContext.reactContext ?: throw IOException("React context missing")
          context.contentResolver.openInputStream(uri)
            ?: throw IOException("Unable to read content URI")
        }
        else -> throw IOException("Unsupported local file URI")
      }

      inputStream.use { stream ->
        var remaining = maxOf(0L, offsetValue.toLong())
        while (remaining > 0) {
          val skipped = stream.skip(remaining)
          if (skipped <= 0L) {
            if (stream.read() < 0) break
            remaining -= 1
          } else {
            remaining -= skipped
          }
        }

        val buffer = ByteArray(length)
        var read = 0
        while (read < length) {
          val count = stream.read(buffer, read, length - read)
          if (count < 0) break
          if (count > 0) read += count
        }

        mapOf(
          "data" to Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP),
          "done" to (read < length),
        )
      }
    }

    AsyncFunction("load") { engineId: String, source: Map<String, Any?>, promise: Promise ->
      executor.execute {
        try {
          val state = PapyrusEngineStore.getEngine(engineId)
          if (state == null) {
            promise.reject("papyrus_no_engine", "Engine not found", null)
            return@execute
          }

          val context = appContext.reactContext ?: throw IllegalStateException("React context missing")
          val file = materializeSource(source, context)
          if (file == null) {
            promise.reject("papyrus_invalid_source", "Unsupported PDF source", null)
            return@execute
          }

          val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
          val document = state.pdfium.newDocument(fd)
          PapyrusEngineStore.setDocument(state, document, fd, file.absolutePath)

          val pageCount = state.pdfium.getPageCount(document)
          promise.resolve(mapOf("pageCount" to pageCount))
        } catch (error: Throwable) {
          promise.reject("papyrus_load_failed", error.message, error)
        }
      }
    }

    Function("getPageCount") { engineId: String ->
      val state = PapyrusEngineStore.getEngine(engineId)
      if (state == null || state.document == null) return@Function 0
      state.pdfium.getPageCount(state.document)
    }

    AsyncFunction("renderPage") { engineId: String, pageIndex: Int, target: Int, scale: Double, zoom: Double, rotation: Int ->
      val state = PapyrusEngineStore.getEngine(engineId) ?: return@AsyncFunction
      UiThreadUtil.runOnUiThread {
        val view = appContext.findView<View>(target)
        if (view is PapyrusPageView) {
          view.render(state, pageIndex, scale.toFloat(), zoom.toFloat(), rotation)
        }
      }
    }

    AsyncFunction("renderTextLayer") { engineId: String, pageIndex: Int, target: Int, scale: Double, zoom: Double, rotation: Int ->
      // no-op
      Unit
    }

    AsyncFunction("getTextContent") { engineId: String, pageIndex: Int, promise: Promise ->
      executor.execute {
        val state = PapyrusEngineStore.getEngine(engineId)
        if (state == null || state.document == null) {
          promise.resolve(emptyList<Any>())
          return@execute
        }
        val text = synchronized(state.pdfiumLock) { extractPageText(state, pageIndex) }
        val items = mutableListOf<Map<String, Any>>()
        if (!text.isNullOrEmpty()) {
          items.add(
            mapOf(
              "str" to text,
              "dir" to "ltr",
              "width" to 0,
              "height" to 0,
              "transform" to listOf(1, 0, 0, 1, 0, 0),
              "fontName" to ""
            )
          )
        }
        promise.resolve(items)
      }
    }

    AsyncFunction("getPageDimensions") { engineId: String, pageIndex: Int, promise: Promise ->
      executor.execute {
        val state = PapyrusEngineStore.getEngine(engineId)
        if (state == null || state.document == null) {
          promise.resolve(mapOf("width" to 0, "height" to 0))
          return@execute
        }
        val (width, height) = synchronized(state.pdfiumLock) {
          val w = state.pdfium.getPageWidthPoint(state.document, pageIndex)
          val h = state.pdfium.getPageHeightPoint(state.document, pageIndex)
          Pair(w, h)
        }
        promise.resolve(mapOf("width" to width, "height" to height))
      }
    }

    AsyncFunction("getOutline") { engineId: String, promise: Promise ->
      executor.execute {
        val state = PapyrusEngineStore.getEngine(engineId)
        if (state == null || state.document == null) {
          promise.resolve(emptyList<Any>())
          return@execute
        }

        var items: Array<PapyrusOutlineItem>? = null
        try {
          if (PapyrusOutline.AVAILABLE) {
            if (!state.sourcePath.isNullOrEmpty()) {
              synchronized(state.pdfiumLock) {
                items = PapyrusOutline.nativeGetOutlineFile(state.sourcePath)
              }
            } else {
              val docPtr = synchronized(state.pdfiumLock) { extractNativeDocPointer(state.document) }
              if (docPtr != 0L) {
                synchronized(state.pdfiumLock) {
                  items = PapyrusOutline.nativeGetOutline(docPtr)
                }
              }
            }
          }
        } catch (_: Throwable) {
          items = null
        }

        val result = mutableListOf<Map<String, Any?>>()
        items?.forEach { item ->
          result.add(serializeOutlineItem(item))
        }
        promise.resolve(result)
      }
    }

    AsyncFunction("getPageIndex") { engineId: String, dest: Map<String, Any?>, promise: Promise ->
      val kind = dest["kind"] as? String
      val value = dest["value"]

      if (kind == "pageIndex" && value is Number) {
        promise.resolve(value.toInt())
        return@AsyncFunction
      }

      if (kind == "pageNumber" && value is Number) {
        promise.resolve(maxOf(0, value.toInt() - 1))
        return@AsyncFunction
      }

      promise.resolve(null)
    }

    AsyncFunction("searchText") { engineId: String, query: String, promise: Promise ->
      executor.execute {
        val state = PapyrusEngineStore.getEngine(engineId)
        if (state == null || state.document == null || query.length < 2) {
          promise.resolve(emptyList<Any>())
          return@execute
        }

        val pageCount = state.pdfium.getPageCount(state.document)
        state.isSearching = true
        try {
          try {
            if (PapyrusTextSearch.AVAILABLE) {
              var hits: Array<PapyrusTextHit>? = null
              if (!state.sourcePath.isNullOrEmpty()) {
                synchronized(state.pdfiumLock) {
                  hits = PapyrusTextSearch.nativeSearchFile(state.sourcePath, query)
                }
              } else {
                val docPtr = synchronized(state.pdfiumLock) { extractNativeDocPointer(state.document) }
                if (docPtr != 0L) {
                  synchronized(state.pdfiumLock) {
                    hits = PapyrusTextSearch.nativeSearch(docPtr, pageCount, query)
                  }
                }
              }

              if (!hits.isNullOrEmpty()) {
                val results = mutableListOf<Map<String, Any?>>()
                hits?.forEach { hit ->
                  val result = mutableMapOf<String, Any?>(
                    "pageIndex" to hit.pageIndex,
                    "text" to (hit.text ?: query),
                    "matchIndex" to hit.matchIndex
                  )
                  val rects = hit.rects
                  if (rects != null && rects.size >= 4) {
                    val rectList = mutableListOf<Map<String, Any>>()
                    var i = 0
                    while (i + 3 < rects.size) {
                      rectList.add(
                        mapOf(
                          "x" to rects[i],
                          "y" to rects[i + 1],
                          "width" to rects[i + 2],
                          "height" to rects[i + 3]
                        )
                      )
                      i += 4
                    }
                    result["rects"] = rectList
                  }
                  results.add(result)
                }
                promise.resolve(results)
                return@execute
              }
            }
          } catch (_: Throwable) {
          }

          val normalizedQuery = query.lowercase()
          val results = mutableListOf<Map<String, Any?>>()

          for (pageIndex in 0 until pageCount) {
            val text = synchronized(state.pdfiumLock) { extractPageText(state, pageIndex) } ?: ""
            if (text.isEmpty()) continue

            val lower = text.lowercase()
            var pos = lower.indexOf(normalizedQuery)
            var matchIndex = 0
            while (pos != -1) {
              val start = maxOf(0, pos - 20)
              val end = minOf(text.length, pos + normalizedQuery.length + 20)
              val preview = text.substring(start, end)

              results.add(
                mapOf(
                  "pageIndex" to pageIndex,
                  "text" to preview,
                  "matchIndex" to matchIndex++
                )
              )

              pos = lower.indexOf(normalizedQuery, pos + 1)
            }
          }

          promise.resolve(results)
        } finally {
          state.isSearching = false
        }
      }
    }

    AsyncFunction("selectText") { engineId: String, pageIndex: Int, x: Double, y: Double, width: Double, height: Double, promise: Promise ->
      executor.execute {
        val state = PapyrusEngineStore.getEngine(engineId)
        if (state == null || state.document == null || pageIndex < 0) {
          promise.resolve(null)
          return@execute
        }

        if (!PapyrusTextSelect.AVAILABLE) {
          promise.resolve(null)
          return@execute
        }

        var selection: PapyrusTextSelection? = null
        try {
          if (!state.sourcePath.isNullOrEmpty()) {
            synchronized(state.pdfiumLock) {
              selection = PapyrusTextSelect.nativeSelectTextFile(
                state.sourcePath,
                pageIndex,
                x.toFloat(),
                y.toFloat(),
                width.toFloat(),
                height.toFloat()
              )
            }
          } else {
            val docPtr = synchronized(state.pdfiumLock) { extractNativeDocPointer(state.document) }
            if (docPtr != 0L) {
              synchronized(state.pdfiumLock) {
                selection = PapyrusTextSelect.nativeSelectText(
                  docPtr,
                  pageIndex,
                  x.toFloat(),
                  y.toFloat(),
                  width.toFloat(),
                  height.toFloat()
                )
              }
            }
          }
        } catch (_: Throwable) {
          selection = null
        }

        val rects = selection?.rects
        if (selection == null || rects == null || rects.isEmpty()) {
          promise.resolve(null)
          return@execute
        }

        val rectList = mutableListOf<Map<String, Any>>()
        var i = 0
        while (i + 3 < rects.size) {
          rectList.add(
            mapOf(
              "x" to rects[i],
              "y" to rects[i + 1],
              "width" to rects[i + 2],
              "height" to rects[i + 3]
            )
          )
          i += 4
        }

        promise.resolve(
          mapOf(
            "text" to (selection?.text ?: ""),
            "rects" to rectList
          )
        )
      }
    }
  }

  private fun extractPageText(state: PapyrusEngineStore.EngineState, pageIndex: Int): String? {
    try {
      state.pdfium.openPage(state.document, pageIndex)
    } catch (_: Throwable) {
    }

    try {
      var method: Method? = null
      method = try {
        state.pdfium.javaClass.getDeclaredMethod("getPageText", PdfDocument::class.java, Int::class.javaPrimitiveType)
      } catch (_: NoSuchMethodException) {
        null
      }

      if (method == null) {
        method = try {
          state.pdfium.javaClass.getDeclaredMethod("nativeGetPageText", Long::class.javaPrimitiveType, Int::class.javaPrimitiveType)
        } catch (_: NoSuchMethodException) {
          null
        }
      }

      if (method != null) {
        method.isAccessible = true
        val result = if (method.parameterTypes.size == 2 && method.parameterTypes[0] == PdfDocument::class.java) {
          method.invoke(state.pdfium, state.document, pageIndex)
        } else if (method.parameterTypes.size == 2 && method.parameterTypes[0] == Long::class.javaPrimitiveType) {
          val docPtr = extractNativeDocPointer(state.document)
          method.invoke(state.pdfium, docPtr, pageIndex)
        } else {
          null
        }
        return result?.toString() ?: ""
      }
    } catch (_: Throwable) {
    }

    return ""
  }

  private fun extractNativeDocPointer(document: PdfDocument?): Long {
    if (document == null) return 0L
    return try {
      val field = PdfDocument::class.java.getDeclaredField("mNativeDocPtr")
      field.isAccessible = true
      val value = field.get(document)
      if (value is Long) value else 0L
    } catch (_: Throwable) {
      0L
    }
  }

  private fun serializeOutlineItem(item: PapyrusOutlineItem): Map<String, Any?> {
    val map = mutableMapOf<String, Any?>(
      "title" to (item.title ?: ""),
      "pageIndex" to item.pageIndex
    )
    val children = item.children
    if (children != null && children.isNotEmpty()) {
      val childMaps = mutableListOf<Map<String, Any?>>()
      children.forEach { child ->
        childMaps.add(serializeOutlineItem(child))
      }
      map["children"] = childMaps
    }
    return map
  }

  @Throws(IOException::class)
  private fun materializeSource(source: Map<String, Any?>, context: Context): File? {
    val uriValue = source["uri"]
    if (uriValue is String) {
      if (uriValue.startsWith("http://") || uriValue.startsWith("https://")) {
        return downloadToCache(uriValue, context)
      }

      if (uriValue.startsWith("asset:/")) {
        return copyFromAsset(uriValue.substring("asset:/".length), context)
      }

      if (uriValue.startsWith("file:///android_asset/")) {
        return copyFromAsset(uriValue.substring("file:///android_asset/".length), context)
      }

      if (uriValue.startsWith("content://")) {
        return copyFromContentUri(Uri.parse(uriValue), context)
      }

      if (uriValue.startsWith("file://")) {
        return File(Uri.parse(uriValue).path ?: return null)
      }

      if (uriValue.startsWith("res://")) {
        val resourceName = uriValue.substring("res://".length)
        val resourceId = context.resources.getIdentifier(resourceName, "raw", context.packageName)
        if (resourceId != 0) {
          return copyFromRawResource(resourceId, context)
        }
      }

      val resourceId = context.resources.getIdentifier(uriValue, "raw", context.packageName)
      if (resourceId != 0) {
        return copyFromRawResource(resourceId, context)
      }

      return File(uriValue)
    }

    val dataValue = source["data"]
    if (dataValue != null) {
      val bytes = toByteArray(dataValue)
      if (bytes != null) {
        return writeBytesToCache(bytes, context)
      }
    }

    return null
  }

  private fun toByteArray(value: Any): ByteArray? {
    return when (value) {
      is ByteArray -> value
      is Uint8Array -> {
        val bytes = ByteArray(value.byteLength)
        value.read(bytes, 0, value.byteLength)
        bytes
      }
      is List<*> -> {
        val bytes = ByteArray(value.size)
        value.forEachIndexed { index, item ->
          val number = item as? Number ?: return null
          bytes[index] = number.toInt().toByte()
        }
        bytes
      }
      else -> null
    }
  }

  @Throws(IOException::class)
  private fun downloadToCache(uri: String, context: Context): File {
    val url = URL(uri)
    val connection = url.openConnection() as HttpURLConnection
    connection.connect()
    if (connection.responseCode >= 400) {
      throw IOException("Failed to download PDF")
    }
    val inputStream = connection.inputStream
    val out = createTempFile(context)
    writeStreamToFile(inputStream, out)
    connection.disconnect()
    return out
  }

  @Throws(IOException::class)
  private fun copyFromContentUri(uri: Uri, context: Context): File {
    val resolver: ContentResolver = context.contentResolver
    val inputStream = resolver.openInputStream(uri) ?: throw IOException("Unable to read content URI")
    val out = createTempFile(context)
    writeStreamToFile(inputStream, out)
    return out
  }

  @Throws(IOException::class)
  private fun copyFromAsset(assetPath: String, context: Context): File {
    val inputStream = context.assets.open(assetPath)
    val out = createTempFile(context)
    writeStreamToFile(inputStream, out)
    return out
  }

  @Throws(IOException::class)
  private fun copyFromRawResource(resourceId: Int, context: Context): File {
    val inputStream = context.resources.openRawResource(resourceId)
    val out = createTempFile(context)
    writeStreamToFile(inputStream, out)
    return out
  }

  @Throws(IOException::class)
  private fun writeBytesToCache(bytes: ByteArray, context: Context): File {
    val out = createTempFile(context)
    FileOutputStream(out).use { fos ->
      fos.write(bytes)
      fos.flush()
    }
    return out
  }

  @Throws(IOException::class)
  private fun createTempFile(context: Context): File {
    val cacheDir = context.cacheDir
    return File.createTempFile("papyrus", ".pdf", cacheDir)
  }

  @Throws(IOException::class)
  private fun writeStreamToFile(inputStream: InputStream, out: File) {
    FileOutputStream(out).use { fos ->
      val buffer = ByteArray(8192)
      var read: Int
      while (true) {
        read = inputStream.read(buffer)
        if (read == -1) break
        fos.write(buffer, 0, read)
      }
      fos.flush()
    }
    inputStream.close()
  }
}
