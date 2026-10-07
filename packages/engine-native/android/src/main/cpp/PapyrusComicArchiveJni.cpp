#include "PapyrusComicArchive.h"

#include <jni.h>

#include <string>

namespace {
std::string from_java(JNIEnv *env, jstring value) {
  if (!value) return {};
  const char *utf = env->GetStringUTFChars(value, nullptr);
  if (!utf) return {};
  std::string result(utf);
  env->ReleaseStringUTFChars(value, utf);
  return result;
}

void throw_io(JNIEnv *env, const char *message) {
  jclass exception = env->FindClass("java/io/IOException");
  if (exception) env->ThrowNew(exception, message ? message : "Comic archive operation failed");
}
}

extern "C" JNIEXPORT jint JNICALL
Java_com_papyrus_engine_PapyrusComicArchiveNative_open(JNIEnv *env, jclass,
                                                        jstring engine_id,
                                                        jint generation,
                                                        jstring archive_path,
                                                        jstring cache_path) {
  const std::string engine = from_java(env, engine_id);
  const std::string archive = from_java(env, archive_path);
  const std::string cache = from_java(env, cache_path);
  int page_count = 0;
  char error[512] = {};
  if (!papyrus_comic_open(engine.c_str(), generation, archive.c_str(), cache.c_str(), &page_count, error, sizeof(error))) {
    throw_io(env, error);
    return 0;
  }
  return page_count;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_papyrus_engine_PapyrusComicArchiveNative_extractPage(JNIEnv *env, jclass,
                                                               jstring engine_id,
                                                               jint generation,
                                                               jint page_index) {
  const std::string engine = from_java(env, engine_id);
  char path[4096] = {};
  char error[512] = {};
  if (!papyrus_comic_extract_page(engine.c_str(), generation, page_index, path, sizeof(path), error, sizeof(error))) {
    throw_io(env, error);
    return nullptr;
  }
  return env->NewStringUTF(path);
}

extern "C" JNIEXPORT void JNICALL
Java_com_papyrus_engine_PapyrusComicArchiveNative_close(JNIEnv *env, jclass,
                                                         jstring engine_id,
                                                         jint generation) {
  const std::string engine = from_java(env, engine_id);
  papyrus_comic_close(engine.c_str(), generation);
}

extern "C" JNIEXPORT void JNICALL
Java_com_papyrus_engine_PapyrusComicArchiveNative_closeEngine(JNIEnv *env, jclass, jstring engine_id) {
  const std::string engine = from_java(env, engine_id);
  papyrus_comic_close_engine(engine.c_str());
}
