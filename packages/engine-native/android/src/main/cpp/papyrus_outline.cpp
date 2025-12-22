#include <jni.h>
#include <android/log.h>
#include <dlfcn.h>

#include <algorithm>
#include <string>
#include <vector>

#define LOG_TAG "PapyrusOutline"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

typedef void *FPDF_DOCUMENT;
typedef void *FPDF_BOOKMARK;
typedef void *FPDF_DEST;

struct PdfiumFns {
  FPDF_DOCUMENT (*loadDocument)(const char *, const char *);
  void (*closeDocument)(FPDF_DOCUMENT);
  FPDF_BOOKMARK (*bookmarkGetFirstChild)(FPDF_DOCUMENT, FPDF_BOOKMARK);
  FPDF_BOOKMARK (*bookmarkGetNextSibling)(FPDF_DOCUMENT, FPDF_BOOKMARK);
  unsigned long (*bookmarkGetTitle)(FPDF_BOOKMARK, void *, unsigned long);
  FPDF_DEST (*bookmarkGetDest)(FPDF_DOCUMENT, FPDF_BOOKMARK);
  int (*destGetPageIndex)(FPDF_DOCUMENT, FPDF_DEST);
};

static void *g_pdfium = nullptr;
static PdfiumFns g_fns = {};
static bool g_loaded = false;

static bool LoadPdfium() {
  if (g_loaded) return g_pdfium != nullptr;

  g_pdfium = dlopen("libmodpdfium.so", RTLD_LAZY);
  if (!g_pdfium) {
    LOGE("Failed to load libmodpdfium.so");
    g_loaded = true;
    return false;
  }

  g_fns.loadDocument = reinterpret_cast<FPDF_DOCUMENT (*)(const char *, const char *)>(dlsym(g_pdfium, "FPDF_LoadDocument"));
  g_fns.closeDocument = reinterpret_cast<void (*)(FPDF_DOCUMENT)>(dlsym(g_pdfium, "FPDF_CloseDocument"));
  g_fns.bookmarkGetFirstChild = reinterpret_cast<FPDF_BOOKMARK (*)(FPDF_DOCUMENT, FPDF_BOOKMARK)>(dlsym(g_pdfium, "FPDFBookmark_GetFirstChild"));
  g_fns.bookmarkGetNextSibling = reinterpret_cast<FPDF_BOOKMARK (*)(FPDF_DOCUMENT, FPDF_BOOKMARK)>(dlsym(g_pdfium, "FPDFBookmark_GetNextSibling"));
  g_fns.bookmarkGetTitle = reinterpret_cast<unsigned long (*)(FPDF_BOOKMARK, void *, unsigned long)>(dlsym(g_pdfium, "FPDFBookmark_GetTitle"));
  g_fns.bookmarkGetDest = reinterpret_cast<FPDF_DEST (*)(FPDF_DOCUMENT, FPDF_BOOKMARK)>(dlsym(g_pdfium, "FPDFBookmark_GetDest"));
  g_fns.destGetPageIndex = reinterpret_cast<int (*)(FPDF_DOCUMENT, FPDF_DEST)>(dlsym(g_pdfium, "FPDFDest_GetPageIndex"));

  if (!g_fns.loadDocument || !g_fns.closeDocument || !g_fns.bookmarkGetFirstChild ||
      !g_fns.bookmarkGetNextSibling || !g_fns.bookmarkGetTitle || !g_fns.bookmarkGetDest ||
      !g_fns.destGetPageIndex) {
    LOGE("Failed to load required PDFium symbols for outline");
    g_loaded = true;
    return false;
  }

  g_loaded = true;
  return true;
}

static jstring GetBookmarkTitle(JNIEnv *env, FPDF_BOOKMARK bookmark) {
  unsigned long length = g_fns.bookmarkGetTitle(bookmark, nullptr, 0);
  if (length <= 2) {
    return env->NewStringUTF("");
  }

  std::vector<unsigned short> buffer((length / 2) + 1, 0);
  unsigned long written = g_fns.bookmarkGetTitle(bookmark, buffer.data(), length);
  int chars = written > 0 ? static_cast<int>(written / 2) - 1 : static_cast<int>(length / 2) - 1;
  if (chars <= 0) {
    return env->NewStringUTF("");
  }

  return env->NewString(reinterpret_cast<const jchar *>(buffer.data()), chars);
}

static jobjectArray BuildOutlineItems(JNIEnv *env, FPDF_DOCUMENT doc, FPDF_BOOKMARK parent, jclass itemClass, jmethodID ctor) {
  std::vector<jobject> items;

  for (FPDF_BOOKMARK child = g_fns.bookmarkGetFirstChild(doc, parent); child;
       child = g_fns.bookmarkGetNextSibling(doc, child)) {
    jstring title = GetBookmarkTitle(env, child);
    int pageIndex = -1;
    FPDF_DEST dest = g_fns.bookmarkGetDest(doc, child);
    if (dest) {
      pageIndex = g_fns.destGetPageIndex(doc, dest);
    }

    jobjectArray children = BuildOutlineItems(env, doc, child, itemClass, ctor);
    jobject item = env->NewObject(itemClass, ctor, title, pageIndex, children);

    if (title) env->DeleteLocalRef(title);
    if (children) env->DeleteLocalRef(children);

    if (item) {
      items.push_back(item);
    }
  }

  jobjectArray array = env->NewObjectArray(static_cast<jsize>(items.size()), itemClass, nullptr);
  for (jsize i = 0; i < static_cast<jsize>(items.size()); i++) {
    env->SetObjectArrayElement(array, i, items[i]);
  }

  return array;
}

static jobjectArray BuildOutline(JNIEnv *env, FPDF_DOCUMENT doc) {
  jclass itemClass = env->FindClass("com/papyrus/engine/PapyrusOutlineItem");
  if (!itemClass) return nullptr;
  jmethodID ctor = env->GetMethodID(itemClass, "<init>", "(Ljava/lang/String;I[Lcom/papyrus/engine/PapyrusOutlineItem;)V");
  if (!ctor) return nullptr;
  return BuildOutlineItems(env, doc, nullptr, itemClass, ctor);
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_papyrus_engine_PapyrusOutline_nativeGetOutline(JNIEnv *env, jclass, jlong docPtr) {
  if (!LoadPdfium()) return nullptr;
  if (!docPtr) return nullptr;

  FPDF_DOCUMENT doc = reinterpret_cast<FPDF_DOCUMENT>(docPtr);
  return BuildOutline(env, doc);
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_papyrus_engine_PapyrusOutline_nativeGetOutlineFile(JNIEnv *env, jclass, jstring filePath) {
  if (!LoadPdfium()) return nullptr;
  if (!filePath) return nullptr;

  const char *path = env->GetStringUTFChars(filePath, nullptr);
  if (!path) return nullptr;

  FPDF_DOCUMENT doc = g_fns.loadDocument(path, nullptr);
  env->ReleaseStringUTFChars(filePath, path);
  if (!doc) return nullptr;

  jobjectArray result = BuildOutline(env, doc);
  g_fns.closeDocument(doc);
  return result;
}
