package com.papyrus.engine;

/** Small, platform-independent rules for the PDF text-selection gesture. */
final class PapyrusTextSelectionGesture {
  private PapyrusTextSelectionGesture() {}

  static boolean shouldActivate(boolean isDoubleTap) {
    return isDoubleTap;
  }

  static boolean shouldEmitPageTap(boolean isDoubleTap) {
    return !isDoubleTap;
  }

  /** A touch that starts on a handle or inside the selection keeps it. */
  static boolean shouldDismissSelectionOnTouch(
    boolean hasSelection,
    boolean hitHandle,
    boolean insideSelection
  ) {
    return hasSelection && !hitHandle && !insideSelection;
  }

  /** A touch that starts with a painted selection never becomes a page tap. */
  static boolean shouldSuppressPageTap(boolean hadSelectionAtDown) {
    return hadSelectionAtDown;
  }

  /** Dragging inside the selection past the threshold dismisses it and scrolls. */
  static boolean shouldStartScrollFromSelection(
    boolean insideSelection,
    float distance,
    float thresholdPx
  ) {
    return insideSelection && distance > thresholdPx;
  }

  static boolean resolveDoubleTap(
    long now,
    long lastTapTime,
    float dx,
    float dy,
    long timeoutMs,
    float maxDistancePx
  ) {
    if (lastTapTime <= 0) return false;
    if (now - lastTapTime >= timeoutMs) return false;
    return Math.hypot(dx, dy) <= maxDistancePx;
  }

  /** Keep the selection endpoint where the user's finger actually landed. */
  static float resolveSelectionEndpoint(float normalizedX) {
    return Math.max(0f, Math.min(1f, normalizedX));
  }

  /** Complete the line crossed by a selection endpoint. */
  static float resolveSelectionEndpoint(
    float normalizedX,
    boolean crossedLine,
    boolean isStartHandle
  ) {
    if (crossedLine) return isStartHandle ? 0f : 1f;
    return resolveSelectionEndpoint(normalizedX);
  }
}
