package com.papyrus.engine;

final class PapyrusTextSearch {
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

  static native PapyrusTextHit[] nativeSearch(long docPtr, int pageCount, String query);

  static native PapyrusTextHit[] nativeSearchFile(String filePath, String query);
}
