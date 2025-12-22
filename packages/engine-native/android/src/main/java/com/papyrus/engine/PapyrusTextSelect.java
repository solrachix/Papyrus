package com.papyrus.engine;

final class PapyrusTextSelect {
  static final boolean AVAILABLE;

  static {
    boolean available = false;
    try {
      System.loadLibrary("papyrus_text");
      available = true;
    } catch (Throwable ignored) {
      available = false;
    }
    AVAILABLE = available;
  }

  static native PapyrusTextSelection nativeSelectText(long docPtr, int pageIndex, float x, float y, float width, float height);

  static native PapyrusTextSelection nativeSelectTextFile(String filePath, int pageIndex, float x, float y, float width, float height);
}
