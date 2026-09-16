#include <jni.h>
#include <android/log.h>
#include <dlfcn.h>

#include <algorithm>
#include <cmath>
#include <limits>
#include <string>
#include <vector>

#include "papyrus_text_word.h"

#define LOG_TAG "PapyrusText"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

typedef void *FPDF_DOCUMENT;
typedef void *FPDF_PAGE;
typedef void *FPDF_TEXTPAGE;
typedef void *FPDF_SCHHANDLE;
typedef const unsigned short *FPDF_WIDESTRING;

constexpr int kMaxHits = 200;

struct PdfiumFns {
  FPDF_PAGE (*loadPage)(FPDF_DOCUMENT, int);
  void (*closePage)(FPDF_PAGE);
  double (*getPageWidth)(FPDF_PAGE);
  double (*getPageHeight)(FPDF_PAGE);
  int (*getDocPageCount)(FPDF_DOCUMENT);
  FPDF_DOCUMENT (*loadDocument)(const char *, const char *);
  void (*closeDocument)(FPDF_DOCUMENT);
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
  g_fns.getDocPageCount = reinterpret_cast<int (*)(FPDF_DOCUMENT)>(dlsym(g_pdfium, "FPDF_GetPageCount"));
  g_fns.loadDocument = reinterpret_cast<FPDF_DOCUMENT (*)(const char *, const char *)>(dlsym(g_pdfium, "FPDF_LoadDocument"));
  g_fns.closeDocument = reinterpret_cast<void (*)(FPDF_DOCUMENT)>(dlsym(g_pdfium, "FPDF_CloseDocument"));
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
      !g_fns.getDocPageCount || !g_fns.loadDocument || !g_fns.closeDocument ||
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

static jobjectArray SearchDocument(JNIEnv *env, FPDF_DOCUMENT doc, int pageCount, const unsigned short *wideQuery, jsize queryLen) {
  if (!doc || pageCount <= 0 || !wideQuery || queryLen <= 0) return nullptr;

  jclass hitClass = env->FindClass("com/papyrus/engine/PapyrusTextHit");
  if (!hitClass) return nullptr;
  jmethodID ctor = env->GetMethodID(hitClass, "<init>", "(IILjava/lang/String;[F)V");
  if (!ctor) return nullptr;

  std::vector<jobject> hits;
  hits.reserve(32);

  for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    FPDF_PAGE page = g_fns.loadPage(doc, pageIndex);
    if (!page) continue;
    FPDF_TEXTPAGE textPage = g_fns.textLoadPage(page);
    if (!textPage) {
      g_fns.closePage(page);
      continue;
    }

    FPDF_SCHHANDLE handle = g_fns.textFindStart(textPage, wideQuery, 0, 0);
    if (handle) {
      int matchIndex = 0;
      while (g_fns.textFindNext(handle)) {
        int startIndex = g_fns.textGetSchResultIndex(handle);
        int count = g_fns.textGetSchCount(handle);
        int totalChars = g_fns.textCountChars(textPage);
        if (startIndex < 0 || startIndex >= totalChars) continue;
        if (count <= 0) count = 1;
        if (startIndex + count > totalChars) {
          count = std::max(1, totalChars - startIndex);
        }

        jstring preview = BuildPreview(env, textPage, startIndex, count);
        jfloatArray rects = BuildRect(env, textPage, page, startIndex, count);
        jobject hit = env->NewObject(hitClass, ctor, pageIndex, matchIndex, preview, rects);
        if (hit) {
          hits.push_back(hit);
        }
        matchIndex++;
        if (static_cast<int>(hits.size()) >= kMaxHits) break;
      }
      g_fns.textFindClose(handle);
    }

    g_fns.textClosePage(textPage);
    g_fns.closePage(page);
    if (static_cast<int>(hits.size()) >= kMaxHits) break;
  }

  jobjectArray result = env->NewObjectArray(static_cast<jsize>(hits.size()), hitClass, nullptr);
  for (jsize i = 0; i < static_cast<jsize>(hits.size()); i++) {
    env->SetObjectArrayElement(result, i, hits[i]);
  }

  return result;
}

static jobject BuildSelection(JNIEnv *env, FPDF_DOCUMENT doc, int pageIndex, double normX, double normY, double normW, double normH,
                              double startNormX, double startNormY, double endNormX, double endNormY) {
  if (!doc || pageIndex < 0 || normW <= 0 || normH <= 0) return nullptr;

  jclass selectionClass = env->FindClass("com/papyrus/engine/PapyrusTextSelection");
  if (!selectionClass) return nullptr;
  jmethodID ctor = env->GetMethodID(selectionClass, "<init>", "(Ljava/lang/String;[F)V");
  if (!ctor) return nullptr;

  FPDF_PAGE page = g_fns.loadPage(doc, pageIndex);
  if (!page) return nullptr;
  FPDF_TEXTPAGE textPage = g_fns.textLoadPage(page);
  if (!textPage) {
    g_fns.closePage(page);
    return nullptr;
  }

  double pageWidth = g_fns.getPageWidth(page);
  double pageHeight = g_fns.getPageHeight(page);
  if (pageWidth <= 0 || pageHeight <= 0) {
    g_fns.textClosePage(textPage);
    g_fns.closePage(page);
    return nullptr;
  }

  double rectLeft = normX * pageWidth;
  double rectTop = pageHeight - (normY * pageHeight);
  double rectRight = rectLeft + (normW * pageWidth);
  double rectBottom = rectTop - (normH * pageHeight);

  std::vector<char16_t> pageChars;

  struct CharBox {
    int index;
    double left;
    double right;
    double top;
    double bottom;
    unsigned short value;
  };

  struct LineRect {
    double left;
    double right;
    double top;
    double bottom;
    std::vector<int> chars;
  };

  std::vector<LineRect> lines;
  std::u16string selectedText;

  int charCount = g_fns.textCountChars(textPage);
  if (charCount <= 0) {
    g_fns.textClosePage(textPage);
    g_fns.closePage(page);
    return nullptr;
  }

  std::vector<unsigned short> charBuffer(2, 0);
  std::vector<CharBox> chars;

  for (int i = 0; i < charCount; i++) {
    double cLeft = 0;
    double cRight = 0;
    double cTop = 0;
    double cBottom = 0;
    if (!g_fns.textGetCharBox(textPage, i, &cLeft, &cRight, &cBottom, &cTop)) continue;

    int written = g_fns.textGetText(textPage, i, 1, charBuffer.data());
    if (written <= 0 || charBuffer[0] == 0) continue;

    chars.push_back({i, cLeft, cRight, cTop, cBottom, charBuffer[0]});
    pageChars.push_back(static_cast<char16_t>(charBuffer[0]));
    int lineIndex = -1;
    const double charHeight = std::max(0.001, cTop - cBottom);
    for (int line = 0; line < static_cast<int>(lines.size()); line++) {
      const auto &candidate = lines[line];
      const double overlap = std::min(candidate.top, cTop) - std::max(candidate.bottom, cBottom);
      const double candidateHeight = std::max(0.001, candidate.top - candidate.bottom);
      const double minHeight = std::min(charHeight, candidateHeight);
      const double centerDistance = std::abs((candidate.top + candidate.bottom) / 2.0 - (cTop + cBottom) / 2.0);
      if (overlap >= minHeight * 0.2 || centerDistance <= minHeight * 0.5) {
        lineIndex = line;
        break;
      }
    }
    if (lineIndex < 0) {
      lines.push_back({cLeft, cRight, cTop, cBottom, {}});
      lineIndex = static_cast<int>(lines.size()) - 1;
    }
    lines[lineIndex].left = std::min(lines[lineIndex].left, cLeft);
    lines[lineIndex].right = std::max(lines[lineIndex].right, cRight);
    lines[lineIndex].top = std::max(lines[lineIndex].top, cTop);
    lines[lineIndex].bottom = std::min(lines[lineIndex].bottom, cBottom);
    lines[lineIndex].chars.push_back(static_cast<int>(chars.size()) - 1);
  }

  std::sort(lines.begin(), lines.end(), [](const LineRect &a, const LineRect &b) {
    if (a.top != b.top) return a.top > b.top;
    return a.left < b.left;
  });

  const bool hasEndpoints = std::isfinite(startNormX) && std::isfinite(startNormY) &&
                            std::isfinite(endNormX) && std::isfinite(endNormY) &&
                            startNormX >= 0 && startNormY >= 0 && endNormX >= 0 && endNormY >= 0;
  std::vector<bool> selected(chars.size(), false);
  if (hasEndpoints && !lines.empty()) {
    const double startX = std::max(0.0, std::min(1.0, startNormX)) * pageWidth;
    const double endX = std::max(0.0, std::min(1.0, endNormX)) * pageWidth;
    const double startY = std::max(0.0, std::min(1.0, startNormY)) * pageHeight;
    const double endY = std::max(0.0, std::min(1.0, endNormY)) * pageHeight;

    const bool isPointSelection =
        startNormX == endNormX && startNormY == endNormY;
    if (isPointSelection) {
      const double pointX = startX;
      const double pointY = pageHeight - startY;
      int pointChar = -1;
      double bestDistance = std::numeric_limits<double>::max();
      for (int i = 0; i < static_cast<int>(chars.size()); i++) {
        const auto &character = chars[i];
        const bool inside = pointX >= character.left && pointX <= character.right &&
                            pointY >= character.bottom && pointY <= character.top;
        if (inside) {
          pointChar = i;
          break;
        }
        const double dx = std::max({character.left - pointX, pointX - character.right, 0.0});
        const double dy = std::max({character.bottom - pointY, pointY - character.top, 0.0});
        const double distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          pointChar = i;
        }
      }
      if (pointChar >= 0) {
        const auto wordRange = papyrus::ResolveWordRange(pageChars, pointChar);
        for (int i = wordRange.first; i < wordRange.second; i++) {
          selected[i] = true;
        }
      }
    } else {
      auto findLine = [&](double pdfY) {        int best = 0;
        double bestDistance = std::numeric_limits<double>::max();
        for (int i = 0; i < static_cast<int>(lines.size()); i++) {
          const auto &line = lines[i];
          double distance = 0.0;
          if (pdfY > line.top) distance = pdfY - line.top;
          else if (pdfY < line.bottom) distance = line.bottom - pdfY;
          if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
          }
        }
        return best;
      };

      const int startLine = findLine(pageHeight - startY);
      const int endLine = findLine(pageHeight - endY);
      const bool forward = startLine < endLine || (startLine == endLine && startX <= endX);
      const int firstLine = std::min(startLine, endLine);
      const int lastLine = std::max(startLine, endLine);

      for (int lineIndex = firstLine; lineIndex <= lastLine; lineIndex++) {
        const auto &line = lines[lineIndex];
        for (int charIndex : line.chars) {
          const auto &character = chars[charIndex];
          bool include = true;
          if (startLine == endLine) {
            const double left = std::min(startX, endX);
            const double right = std::max(startX, endX);
            include = character.right >= left && character.left <= right;
          } else if (forward) {
            if (lineIndex == startLine) include = character.right >= startX;
            else if (lineIndex == endLine) include = character.left <= endX;
          } else {
            if (lineIndex == startLine) include = character.left <= startX;
            else if (lineIndex == endLine) include = character.right >= endX;
          }
          selected[charIndex] = include;
        }
      }
    }
  } else {
    for (int charIndex = 0; charIndex < static_cast<int>(chars.size()); charIndex++) {
      const auto &character = chars[charIndex];
      selected[charIndex] = !(character.right < rectLeft || character.left > rectRight ||
                              character.top < rectBottom || character.bottom > rectTop);
    }
  }

  std::vector<LineRect> selectedLines;
  for (const auto &line : lines) {
    LineRect selectedLine = {0, 0, 0, 0, {}};
    for (int charIndex : line.chars) {
      if (!selected[charIndex]) continue;
      const auto &character = chars[charIndex];
      if (selectedLine.chars.empty()) {
        selectedLine.left = character.left;
        selectedLine.right = character.right;
        selectedLine.top = character.top;
        selectedLine.bottom = character.bottom;
      } else {
        selectedLine.left = std::min(selectedLine.left, character.left);
        selectedLine.right = std::max(selectedLine.right, character.right);
        selectedLine.top = std::max(selectedLine.top, character.top);
        selectedLine.bottom = std::min(selectedLine.bottom, character.bottom);
      }
      selectedLine.chars.push_back(charIndex);
      selectedText.push_back(static_cast<char16_t>(character.value));
    }
    if (!selectedLine.chars.empty()) selectedLines.push_back(selectedLine);
  }

  std::vector<jfloat> rects;
  rects.reserve(selectedLines.size() * 4);
  for (const auto &line : selectedLines) {
    float x = static_cast<float>(line.left / pageWidth);
    float y = static_cast<float>((pageHeight - line.top) / pageHeight);
    float w = static_cast<float>((line.right - line.left) / pageWidth);
    float h = static_cast<float>((line.top - line.bottom) / pageHeight);

    rects.push_back(std::max(0.0f, std::min(1.0f, x)));
    rects.push_back(std::max(0.0f, std::min(1.0f, y)));
    rects.push_back(std::max(0.0f, std::min(1.0f, w)));
    rects.push_back(std::max(0.0f, std::min(1.0f, h)));
  }

  jfloatArray rectArray = env->NewFloatArray(static_cast<jsize>(rects.size()));
  if (rectArray && !rects.empty()) {
    env->SetFloatArrayRegion(rectArray, 0, static_cast<jsize>(rects.size()), rects.data());
  }

  jstring text = selectedText.empty()
                     ? env->NewStringUTF("")
                     : env->NewString(reinterpret_cast<const jchar *>(selectedText.data()), static_cast<jsize>(selectedText.size()));

  jobject selection = env->NewObject(selectionClass, ctor, text, rectArray);

  if (rectArray) env->DeleteLocalRef(rectArray);
  if (text) env->DeleteLocalRef(text);

  g_fns.textClosePage(textPage);
  g_fns.closePage(page);

  return selection;
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

  FPDF_DOCUMENT doc = reinterpret_cast<FPDF_DOCUMENT>(docPtr);
  jobjectArray result = SearchDocument(env, doc, pageCount, wideQuery.data(), queryLen);
  return result;
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_papyrus_engine_PapyrusTextSearch_nativeSearchFile(JNIEnv *env, jclass, jstring filePath, jstring query) {
  if (!LoadPdfium()) return nullptr;
  if (!filePath || !query) return nullptr;

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

  const char *path = env->GetStringUTFChars(filePath, nullptr);
  if (!path) return nullptr;

  FPDF_DOCUMENT doc = g_fns.loadDocument(path, nullptr);
  env->ReleaseStringUTFChars(filePath, path);
  if (!doc) return nullptr;

  int pageCount = g_fns.getDocPageCount(doc);
  jobjectArray result = SearchDocument(env, doc, pageCount, wideQuery.data(), queryLen);
  g_fns.closeDocument(doc);

  return result;
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_papyrus_engine_PapyrusTextSelect_nativeSelectText(JNIEnv *env, jclass, jlong docPtr, jint pageIndex, jfloat x, jfloat y, jfloat width, jfloat height, jfloat startX, jfloat startY, jfloat endX, jfloat endY) {
  if (!LoadPdfium()) return nullptr;
  if (!docPtr) return nullptr;

  FPDF_DOCUMENT doc = reinterpret_cast<FPDF_DOCUMENT>(docPtr);
  return BuildSelection(env, doc, pageIndex, x, y, width, height, startX, startY, endX, endY);
}

extern "C" JNIEXPORT jobject JNICALL
Java_com_papyrus_engine_PapyrusTextSelect_nativeSelectTextFile(JNIEnv *env, jclass, jstring filePath, jint pageIndex, jfloat x, jfloat y, jfloat width, jfloat height, jfloat startX, jfloat startY, jfloat endX, jfloat endY) {
  if (!LoadPdfium()) return nullptr;
  if (!filePath) return nullptr;

  const char *path = env->GetStringUTFChars(filePath, nullptr);
  if (!path) return nullptr;

  FPDF_DOCUMENT doc = g_fns.loadDocument(path, nullptr);
  env->ReleaseStringUTFChars(filePath, path);
  if (!doc) return nullptr;

  jobject selection = BuildSelection(env, doc, pageIndex, x, y, width, height, startX, startY, endX, endY);
  g_fns.closeDocument(doc);
  return selection;
}
