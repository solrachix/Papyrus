package com.papyrus.engine;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PapyrusOutlineTest {
  @Test
  public void computeAvailabilityReturnsTrueWhenLoaderAndProbeSucceed() {
    boolean available = PapyrusOutline.computeAvailability(() -> {}, () -> true);

    assertTrue(available);
  }

  @Test
  public void computeAvailabilityReturnsFalseWhenProbeReturnsFalse() {
    boolean available = PapyrusOutline.computeAvailability(() -> {}, () -> false);

    assertFalse(available);
  }

  @Test
  public void computeAvailabilityReturnsFalseWhenProbeThrows() {
    boolean available = PapyrusOutline.computeAvailability(() -> {}, () -> {
      throw new UnsatisfiedLinkError("missing probe");
    });

    assertFalse(available);
  }

  @Test
  public void computeAvailabilityReturnsFalseWhenLibraryLoadThrows() {
    boolean available = PapyrusOutline.computeAvailability(() -> {
      throw new UnsatisfiedLinkError("missing lib");
    }, () -> true);

    assertFalse(available);
  }
}
