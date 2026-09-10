package com.papyrus.engine;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PapyrusTextSelectionGestureTest {
  @Test
  public void singleTapDoesNotActivateTextSelection() {
    assertFalse(PapyrusTextSelectionGesture.shouldActivate(false));
  }

  @Test
  public void confirmedSingleTapEmitsPageTapButDoubleTapDoesNot() {
    assertTrue(PapyrusTextSelectionGesture.shouldEmitPageTap(false));
    assertFalse(PapyrusTextSelectionGesture.shouldEmitPageTap(true));
  }

  @Test
  public void doubleTapActivatesTextSelection() {
    assertTrue(PapyrusTextSelectionGesture.shouldActivate(true));
  }

  @Test
  public void touchOutsideSelectionReturnsToScrollHandling() {
    assertTrue(PapyrusTextSelectionGesture.shouldContinueAfterSelectionTouch(false));
  }

  @Test
  public void touchInsideSelectionStillReturnsToScrollUnlessItHitsHandle() {
    assertTrue(PapyrusTextSelectionGesture.shouldContinueAfterSelectionTouch(false));
    assertFalse(PapyrusTextSelectionGesture.shouldContinueAfterSelectionTouch(true));
  }

  @Test
  public void draggingAcrossLinesKeepsTheFingerCoordinate() {
    assertEquals(
      0.42f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f),
      0.0001f
    );
  }
}
