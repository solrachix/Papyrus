package com.papyrus.engine;

final class PapyrusComicArchiveNative {
  static {
    System.loadLibrary("papyrus_comic");
  }

  private PapyrusComicArchiveNative() {}

  static native int open(String engineId, int generation, String archivePath, String cachePath);
  static native String extractPage(String engineId, int generation, int pageIndex);
  static native void close(String engineId, int generation);
  static native void closeEngine(String engineId);
}
