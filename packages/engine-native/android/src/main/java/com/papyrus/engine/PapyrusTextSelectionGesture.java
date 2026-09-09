package com.papyrus.engine;

/** Small, platform-independent rules for the PDF text-selection gesture. */
final class PapyrusTextSelectionGesture {
  private PapyrusTextSelectionGesture() {}

  static boolean shouldActivate(boolean isDoubleTap) {
    return isDoubleTap;
  }

  static boolean shouldContinueAfterSelectionTouch(boolean hitHandle) {
    return !hitHandle;
  }

  /** Keep the selection endpoint where the user's finger actually landed. */
  static float resolveSelectionEndpoint(float normalizedX) {
    return Math.max(0f, Math.min(1f, normalizedX));
  }
}
