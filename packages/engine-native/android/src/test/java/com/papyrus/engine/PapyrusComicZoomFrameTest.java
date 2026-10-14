package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class PapyrusComicZoomFrameTest {
  @Test public void coalescesPinchUpdatesUntilTheNextAnimationFrame() {
    PapyrusComicZoomFrame frame = new PapyrusComicZoomFrame();

    assertTrue(frame.offer(1.4f, 100f, 200f));
    assertFalse(frame.offer(1.8f, 120f, 240f));

    PapyrusComicZoomFrame.Update update = frame.takePending();
    assertEquals(1.8f, update.zoom, 0.001f);
    assertEquals(120f, update.focusX, 0.001f);
    assertEquals(240f, update.focusY, 0.001f);
    assertNull(frame.takePending());
    assertTrue(frame.offer(2.0f, 130f, 250f));
  }

  @Test public void usesQueuedZoomAsBaseWhenMorePinchEventsArriveBeforeAFrame() {
    PapyrusComicZoomFrame frame = new PapyrusComicZoomFrame();
    frame.offer(1.5f, 100f, 200f);

    assertEquals(1.8f, frame.nextZoom(1f, 1.2f), 0.001f);
    assertEquals(1f, frame.nextZoom(1f, 0.5f), 0.001f);
  }
}
