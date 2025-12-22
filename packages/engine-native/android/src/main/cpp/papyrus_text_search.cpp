#include <jni.h>
#include <android/log.h>
#include <dlfcn.h>

#include <algorithm>
#include <vector>

#define LOG_TAG "PapyrusText"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

typedef void *FPDF_DOCUMENT;
typedef void *FPDF_PAGE;
typedef void *FPDF_TEXTPAGE;
typedef void *FPDF_SCHHANDLE;
typedef const unsigned short *FPDF_WIDESTRING;

struct PdfiumFns {
  FPDF_PAGE (*loadPage)(FPDF_DOCUMENT, int);
  void (*closePage)(FPDF_PAGE);
  double (*getPageWidth)(FPDF_PAGE);
  double (*getPageHeight)(FPDF_PAGE);
  FPDF_TEXTPAGE (*textLoadPage)(FPDF_PAGE);
  void (*textClosePage)(FPDF_TEXTPAGE);
  FPDF_SCHHANDLE (*textFindStart)(FPDF_TEXTPAGE, FPDF_WIDESTRING, int, int);
  int (*textFindNext)(FPDF_SCHHANDLE);
  void (*textFindClose)(FPDF_SCHHANDLE);
  int (*textGetSchResultIndex)(FPDF_SCHHANDLE);
  int (*textGetSchCount)(FPDF_SCHHANDLE);
  int (*textGetCharBox)(FPDF_TEXTPAGE, int, double *, double *, double *, double *);
  int (*textCountChars)(FPDF_TEXTPAGE);
  int (*textGetText)(FPDF_TEXTPAGE, int, int, unsigned short *);
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

  g_fns.loadPage = reinterpret_cast<FPDF_PAGE (*)(FPDF_DOCUMENT, int)>(dlsym(g_pdfium, "FPDF_LoadPage"));
  g_fns.closePage = reinterpret_cast<void (*)(FPDF_PAGE)>(dlsym(g_pdfium, "FPDF_ClosePage"));
  g_fns.getPageWidth = reinterpret_cast<double (*)(FPDF_PAGE)>(dlsym(g_pdfium, "FPDF_GetPageWidth"));
  g_fns.getPageHeight = reinterpret_cast<double (*)(FPDF_PAGE)>(dlsym(g_pdfium, "FPDF_GetPageHeight"));
  g_fns.textLoadPage = reinterpret_cast<FPDF_TEXTPAGE (*)(FPDF_PAGE)>(dlsym(g_pdfium, "FPDFText_LoadPage"));
  g_fns.textClosePage = reinterpret_cast<void (*)(FPDF_TEXTPAGE)>(dlsym(g_pdfium, "FPDFText_ClosePage"));
  g_fns.textFindStart = reinterpret_cast<FPDF_SCHHANDLE (*)(FPDF_TEXTPAGE, FPDF_WIDESTRING, int, int)>(dlsym(g_pdfium, "FPDFText_FindStart"));
  g_fns.textFindNext = reinterpret_cast<int (*)(FPDF_SCHHANDLE)>(dlsym(g_pdfium, "FPDFText_FindNext"));
  g_fns.textFindClose = reinterpret_cast<void (*)(FPDF_SCHHANDLE)>(dlsym(g_pdfium, "FPDFText_FindClose"));
  g_fns.textGetSchResultIndex = reinterpret_cast<int (*)(FPDF_SCHHANDLE)>(dlsym(g_pdfium, "FPDFText_GetSchResultIndex"));
  g_fns.textGetSchCount = reinterpret_cast<int (*)(FPDF_SCHHANDLE)>(dlsym(g_pdfium, "FPDFText_GetSchCount"));
  g_fns.textGetCharBox = reinterpret_cast<int (*)(FPDF_TEXTPAGE, int, double *, double *, double *, double *)>(dlsym(g_pdfium, "FPDFText_GetCharBox"));
  g_fns.textCountChars = reinterpret_cast<int (*)(FPDF_TEXTPAGE)>(dlsym(g_pdfium, "FPDFText_CountChars"));
  g_fns.textGetText = reinterpret_cast<int (*)(FPDF_TEXTPAGE, int, int, unsigned short *)>(dlsym(g_pdfium, "FPDFText_GetText"));

  if (!g_fns.loadPage || !g_fns.closePage || !g_fns.getPageWidth || !g_fns.getPageHeight ||
      !g_fns.textLoadPage || !g_fns.textClosePage || !g_fns.textFindStart || !g_fns.textFindNext ||
      !g_fns.textFindClose || !g_fns.textGetSchResultIndex || !g_fns.textGetSchCount ||
      !g_fns.textGetCharBox || !g_fns.textCountChars || !g_fns.textGetText) {
    LOGE("Failed to load required PDFium symbols");
    g_loaded = true;
    return false;
  }

  g_loaded = true;
  return true;
}

static jstring BuildPreview(JNIEnv *env, FPDF_TEXTPAGE textPage, int startIndex, int count) {
  int totalChars = g_fns.textCountChars(textPage);
  if (totalChars <= 0) return env->NewStringUTF("");

  int previewStart = std::max(0, startIndex - 20);
  int previewCount = std::min(totalChars - previewStart, count + 40);
  if (previewCount <= 0) return env->NewStringUTF("");

  std::vector<unsigned short> buffer(previewCount + 1, 0);
  int written = g_fns.textGetText(textPage, previewStart, previewCount, buffer.data());
  int length = written > 0 ? written - 1 : 0;
  if (length <= 0) return env->NewStringUTF("");

  return env->NewString(reinterpret_cast<const jchar *>(buffer.data()), length);
}

static jfloatArray BuildRect(JNIEnv *env, FPDF_TEXTPAGE textPage, FPDF_PAGE page, int startIndex, int count) {
  double left = 0;
  double right = 0;
  double top = 0;
  double bottom = 0;
  bool hasBox = false;

  for (int i = 0; i < count; i++) {
    double cLeft = 0;
    double cRight = 0;
    double cTop = 0;
    double cBottom = 0;
    if (!g_fns.textGetCharBox(textPage, startIndex + i, &cLeft, &cRight, &cBottom, &cTop)) continue;
    if (!hasBox) {
      left = cLeft;
      right = cRight;
      top = cTop;
      bottom = cBottom;
      hasBox = true;
    } else {
      left = std::min(left, cLeft);
      right = std::max(right, cRight);
      top = std::max(top, cTop);
      bottom = std::min(bottom, cBottom);
    }
  }

  if (!hasBox) {
    return env->NewFloatArray(0);
  }

  double pageWidth = g_fns.getPageWidth(page);
  double pageHeight = g_fns.getPageHeight(page);
  if (pageWidth <= 0 || pageHeight <= 0) {
    return env->NewFloatArray(0);
  }

  float x = static_cast<float>(left / pageWidth);
  float y = static_cast<float>((pageHeight - top) / pageHeight);
  float w = static_cast<float>((right - left) / pageWidth);
  float h = static_cast<float>((top - bottom) / pageHeight);

  jfloat rects[4] = {
    std::max(0.0f, std::min(1.0f, x)),
    std::max(0.0f, std::min(1.0f, y)),
    std::max(0.0f, std::min(1.0f, w)),
    std::max(0.0f, std::min(1.0f, h)),
  };

  jfloatArray array = env->NewFloatArray(4);
  env->SetFloatArrayRegion(array, 0, 4, rects);
  return array;
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_papyrus_engine_PapyrusTextSearch_nativeSearch(JNIEnv *env, jclass, jlong docPtr, jint pageCount, jstring query) {
  if (!LoadPdfium()) return nullptr;
  if (!docPtr || pageCount <= 0 || query == nullptr) return nullptr;

  const jchar *queryChars = env->GetStringChars(query, nullptr);
  jsize queryLen = env->GetStringLength(query);
  if (!queryChars || queryLen == 0) {
    if (queryChars) env->ReleaseStringChars(query, queryChars);
    return nullptr;
  }

  std::vector<unsigned short> wideQuery(static_cast<size_t>(queryLen) + 1, 0);
  for (jsize i = 0; i < queryLen; i++) {
    wideQuery[i] = static_cast<unsigned short>(queryChars[i]);
  }
  env->ReleaseStringChars(query, queryChars);

  jclass hitClass = env->FindClass("com/papyrus/engine/PapyrusTextHit");
  if (!hitClass) return nullptr;
  jmethodID ctor = env->GetMethodID(hitClass, "<init>", "(IILjava/lang/String;[F)V");
  if (!ctor) return nullptr;

  std::vector<jobject> hits;
  hits.reserve(32);

  FPDF_DOCUMENT doc = reinterpret_cast<FPDF_DOCUMENT>(docPtr);

  for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    FPDF_PAGE page = g_fns.loadPage(doc, pageIndex);
    if (!page) continue;
    FPDF_TEXTPAGE textPage = g_fns.textLoadPage(page);
    if (!textPage) {
      g_fns.closePage(page);
      continue;
    }

    FPDF_SCHHANDLE handle = g_fns.textFindStart(textPage, wideQuery.data(), 0, 0);
    if (handle) {
      int matchIndex = 0;
      while (g_fns.textFindNext(handle)) {
        int startIndex = g_fns.textGetSchResultIndex(handle);
        int count = g_fns.textGetSchCount(handle);
        jstring preview = BuildPreview(env, textPage, startIndex, count);
        jfloatArray rects = BuildRect(env, textPage, page, startIndex, count);
        jobject hit = env->NewObject(hitClass, ctor, pageIndex, matchIndex, preview, rects);
        if (hit) {
          hits.push_back(hit);
        }
        matchIndex++;
      }
      g_fns.textFindClose(handle);
    }

    g_fns.textClosePage(textPage);
    g_fns.closePage(page);
  }

  jobjectArray result = env->NewObjectArray(static_cast<jsize>(hits.size()), hitClass, nullptr);
  for (jsize i = 0; i < static_cast<jsize>(hits.size()); i++) {
    env->SetObjectArrayElement(result, i, hits[i]);
  }

  return result;
}
