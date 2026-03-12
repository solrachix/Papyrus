package com.papyrus.engine;

final class PapyrusOutline {
  interface LibraryLoader {
    void load() throws Throwable;
  }

  interface OutlineSupportProbe {
    boolean isSupported() throws Throwable;
  }

  static final boolean AVAILABLE;

  static {
    AVAILABLE = computeAvailability(
        () -> System.loadLibrary("papyrus_text"),
        PapyrusOutline::nativeIsOutlineSupported);
  }

  static boolean computeAvailability(LibraryLoader loader, OutlineSupportProbe probe) {
    try {
      loader.load();
      return probe.isSupported();
    } catch (Throwable ignored) {
      return false;
    }
  }

  static native boolean nativeIsOutlineSupported();

  static native PapyrusOutlineItem[] nativeGetOutline(long docPtr);

  static native PapyrusOutlineItem[] nativeGetOutlineFile(String filePath);
}
