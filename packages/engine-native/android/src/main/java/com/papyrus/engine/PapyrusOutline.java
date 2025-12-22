package com.papyrus.engine;

final class PapyrusOutline {
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

  static native PapyrusOutlineItem[] nativeGetOutline(long docPtr);

  static native PapyrusOutlineItem[] nativeGetOutlineFile(String filePath);
}
