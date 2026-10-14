package com.papyrus.engine;

/** Coalesces high-frequency scale callbacks into one geometry update per display frame. */
final class PapyrusComicZoomFrame {
  private Update pending;

  boolean offer(float zoom, float focusX, float focusY) {
    boolean shouldScheduleFrame = pending == null;
    pending = new Update(zoom, focusX, focusY);
    return shouldScheduleFrame;
  }

  float nextZoom(float committedZoom, float scaleFactor) {
    float baseZoom = pending == null ? committedZoom : pending.zoom;
    return Math.max(1f, Math.min(5f, baseZoom * scaleFactor));
  }

  Update takePending() {
    Update update = pending;
    pending = null;
    return update;
  }

  void clear() {
    pending = null;
  }

  static final class Update {
    final float zoom;
    final float focusX;
    final float focusY;

    Update(float zoom, float focusX, float focusY) {
      this.zoom = zoom;
      this.focusX = focusX;
      this.focusY = focusY;
    }
  }
}
