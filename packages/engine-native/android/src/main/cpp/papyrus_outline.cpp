#include "papyrus_outline_loader.h"

#include <jni.h>
#include <android/log.h>
#include <dlfcn.h>

#include <cstring>
#include <vector>

#define LOG_TAG "PapyrusOutline"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

OutlineLoaderState g_outline_loader = {};

void *OutlineDlopen(void *, const char *filename, int flags) {
  return dlopen(filename, flags);
}

OutlineLoaderDeps::PdfiumSymbol OutlineDlsym(void *, void *handle, const char *symbol_name) {
  void *raw_symbol = dlsym(handle, symbol_name);
  OutlineLoaderDeps::PdfiumSymbol symbol = nullptr;
  static_assert(sizeof(symbol) == sizeof(raw_symbol),
                "Expected dlsym results to match function pointer size");
  std::memcpy(&symbol, &raw_symbol, sizeof(symbol));
  return symbol;
}

int OutlineDlclose(void *, void *handle) {
  return dlclose(handle);
}

const OutlineLoaderDeps kOutlineLoaderDeps = {
    nullptr,
    &OutlineDlopen,
    &OutlineDlsym,
    &OutlineDlclose,
    "libmodpdfium.so",
    RTLD_LAZY,
};

bool LoadPdfium() {
  const OutlineLoadAttemptResult result =
      EnsureOutlinePdfiumLoaded(&g_outline_loader, &kOutlineLoaderDeps);
  if (!result.loaded && result.transitioned_to_unsupported) {
    LOGE("Failed to load required PDFium symbols for outline");
  }
  return result.loaded;
}

PdfiumOutlineFns &OutlineFns() {
  return g_outline_loader.fns;
}

jstring GetBookmarkTitle(JNIEnv *env, FPDF_BOOKMARK bookmark) {
  unsigned long length = OutlineFns().bookmarkGetTitle(bookmark, nullptr, 0);
  if (length <= 2) {
    return env->NewStringUTF("");
  }

  std::vector<unsigned short> buffer((length / 2) + 1, 0);
  unsigned long written = OutlineFns().bookmarkGetTitle(bookmark, buffer.data(), length);
  int chars = written > 0 ? static_cast<int>(written / 2) - 1
                          : static_cast<int>(length / 2) - 1;
  if (chars <= 0) {
    return env->NewStringUTF("");
  }

  return env->NewString(reinterpret_cast<const jchar *>(buffer.data()), chars);
}

jobjectArray BuildOutlineItems(JNIEnv *env,
                               FPDF_DOCUMENT doc,
                               FPDF_BOOKMARK parent,
                               jclass item_class,
                               jmethodID ctor) {
  std::vector<jobject> items;

  for (FPDF_BOOKMARK child = OutlineFns().bookmarkGetFirstChild(doc, parent); child;
       child = OutlineFns().bookmarkGetNextSibling(doc, child)) {
    jstring title = GetBookmarkTitle(env, child);
    int page_index = -1;
    FPDF_DEST dest = OutlineFns().bookmarkGetDest(doc, child);
    if (dest != nullptr) {
      page_index = OutlineFns().destGetPageIndex(doc, dest);
    }

    jobjectArray children = BuildOutlineItems(env, doc, child, item_class, ctor);
    jobject item = env->NewObject(item_class, ctor, title, page_index, children);

    if (title != nullptr) {
      env->DeleteLocalRef(title);
    }
    if (children != nullptr) {
      env->DeleteLocalRef(children);
    }

    if (item != nullptr) {
      items.push_back(item);
    }
  }

  jobjectArray array =
      env->NewObjectArray(static_cast<jsize>(items.size()), item_class, nullptr);
  for (jsize i = 0; i < static_cast<jsize>(items.size()); i++) {
    env->SetObjectArrayElement(array, i, items[i]);
  }

  return array;
}

jobjectArray BuildOutline(JNIEnv *env, FPDF_DOCUMENT doc) {
  jclass item_class = env->FindClass("com/papyrus/engine/PapyrusOutlineItem");
  if (item_class == nullptr) {
    return nullptr;
  }

  jmethodID ctor = env->GetMethodID(
      item_class, "<init>", "(Ljava/lang/String;I[Lcom/papyrus/engine/PapyrusOutlineItem;)V");
  if (ctor == nullptr) {
    return nullptr;
  }

  return BuildOutlineItems(env, doc, nullptr, item_class, ctor);
}

}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_papyrus_engine_PapyrusOutline_nativeIsOutlineSupported(JNIEnv *, jclass) {
  return LoadPdfium() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_papyrus_engine_PapyrusOutline_nativeGetOutline(JNIEnv *env, jclass, jlong docPtr) {
  if (!LoadPdfium()) {
    return nullptr;
  }
  if (!docPtr) {
    return nullptr;
  }

  FPDF_DOCUMENT doc = reinterpret_cast<FPDF_DOCUMENT>(docPtr);
  return BuildOutline(env, doc);
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_papyrus_engine_PapyrusOutline_nativeGetOutlineFile(JNIEnv *env,
                                                            jclass,
                                                            jstring filePath) {
  if (!LoadPdfium()) {
    return nullptr;
  }
  if (filePath == nullptr) {
    return nullptr;
  }

  const char *path = env->GetStringUTFChars(filePath, nullptr);
  if (path == nullptr) {
    return nullptr;
  }

  FPDF_DOCUMENT doc = OutlineFns().loadDocument(path, nullptr);
  env->ReleaseStringUTFChars(filePath, path);
  if (doc == nullptr) {
    return nullptr;
  }

  jobjectArray result = BuildOutline(env, doc);
  OutlineFns().closeDocument(doc);
  return result;
}
