package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public final class PapyrusTextStoreTest {
  @Test public void closePreventsALateWriteForTheSameGeneration() {
    String engineId = "text-store-close-race";
    PapyrusTextStore.setText(engineId, 3, "current");

    PapyrusTextStore.close(engineId, 3);
    PapyrusTextStore.setText(engineId, 3, "late");

    assertNull(PapyrusTextStore.getText(engineId, 3));
  }

  @Test public void closingAnOlderGenerationKeepsTheNewerDocument() {
    String engineId = "text-store-generation-order";
    PapyrusTextStore.setText(engineId, 5, "newer");

    PapyrusTextStore.close(engineId, 4);

    assertEquals("newer", PapyrusTextStore.getText(engineId, 5));
  }
}
