package com.papyrus.engine;

final class PapyrusBitmapOwnership {
  private PapyrusBitmapOwnership() {}

  static boolean shouldRecycleEvictedBitmap(boolean cached, int activeReferences) {
    return !cached && activeReferences == 0;
  }
}
