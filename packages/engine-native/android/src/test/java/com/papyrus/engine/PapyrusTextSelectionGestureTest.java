package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PapyrusTextSelectionGestureTest {
  @Test
  public void singleTapDoesNotActivateTextSelection() {
    assertFalse(PapyrusTextSelectionGesture.shouldActivate(false));
  }

  @Test
  public void doubleTapActivatesTextSelection() {
    assertTrue(PapyrusTextSelectionGesture.shouldActivate(true));
  }

  @Test
  public void confirmedSingleTapEmitsPageTapButDoubleTapDoesNot() {
    assertTrue(PapyrusTextSelectionGesture.shouldEmitPageTap(false));
    assertFalse(PapyrusTextSelectionGesture.shouldEmitPageTap(true));
  }

  @Test
  public void doubleTapInsideWindowAndDistanceIsAccepted() {
    assertTrue(
      PapyrusTextSelectionGesture.resolveDoubleTap(1000L, 800L, 10f, 10f, 300L, 60f)
    );
  }

  @Test
  public void doubleTapBeyondWindowIsRejected() {
    assertFalse(
      PapyrusTextSelectionGesture.resolveDoubleTap(1200L, 800L, 0f, 0f, 300L, 60f)
    );
  }

  @Test
  public void doubleTapBeyondDistanceIsRejected() {
    assertFalse(
      PapyrusTextSelectionGesture.resolveDoubleTap(1000L, 800L, 70f, 0f, 300L, 60f)
    );
  }

  @Test
  public void firstEverTapIsNotADoubleTap() {
    assertFalse(
      PapyrusTextSelectionGesture.resolveDoubleTap(1000L, 0L, 0f, 0f, 300L, 60f)
    );
  }

  @Test
  public void touchOutsideSelectionDismissesIt() {
    assertTrue(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(true, false, false)
    );
  }

  @Test
  public void touchOnHandleDoesNotDismissSelection() {
    assertFalse(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(true, true, false)
    );
  }

  @Test
  public void touchInsideSelectionDoesNotDismissIt() {
    assertFalse(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(true, false, true)
    );
  }

  @Test
  public void touchWithoutSelectionDoesNotDismissAnything() {
    assertFalse(
      PapyrusTextSelectionGesture.shouldDismissSelectionOnTouch(false, false, false)
    );
  }

  @Test
  public void pageTapIsSuppressedWheneverASelectionExistedAtDown() {
    assertTrue(PapyrusTextSelectionGesture.shouldSuppressPageTap(true));
    assertFalse(PapyrusTextSelectionGesture.shouldSuppressPageTap(false));
  }

  @Test
  public void draggingInsideSelectionBeyondThresholdScrolls() {
    assertTrue(
      PapyrusTextSelectionGesture.shouldStartScrollFromSelection(true, 40f, 30f)
    );
    assertFalse(
      PapyrusTextSelectionGesture.shouldStartScrollFromSelection(true, 20f, 30f)
    );
    assertFalse(
      PapyrusTextSelectionGesture.shouldStartScrollFromSelection(false, 40f, 30f)
    );
  }

  @Test
  public void draggingAcrossLinesKeepsTheFingerCoordinate() {
    assertEquals(
      0.42f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f),
      0.0001f
    );
  }

  @Test
  public void draggingTheEndHandleToAnotherLineCompletesThePreviousLine() {
    assertEquals(
      1f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f, true, false),
      0.0001f
    );
  }

  @Test
  public void draggingTheStartHandleToAnotherLineCompletesTheFollowingLine() {
    assertEquals(
      0f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f, true, true),
      0.0001f
    );
  }

  @Test
  public void draggingWithinTheSameLineKeepsTheFingerCoordinate() {
    assertEquals(
      0.42f,
      PapyrusTextSelectionGesture.resolveSelectionEndpoint(0.42f, false, false),
      0.0001f
    );
  }
}
