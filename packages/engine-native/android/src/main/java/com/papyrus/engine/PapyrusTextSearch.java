package com.papyrus.engine;

final class PapyrusTextSearch {
  static {
    System.loadLibrary("papyrus_text");
  }

  static native PapyrusTextHit[] nativeSearch(long docPtr, int pageCount, String query);
}
