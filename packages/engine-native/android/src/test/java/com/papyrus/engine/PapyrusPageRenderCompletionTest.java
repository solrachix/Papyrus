package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.junit.Test;

public class PapyrusPageRenderCompletionTest {
  @Test
  public void promotesOnlyTheFirstTerminalState() {
    List<PapyrusRenderCompletion.Status> statuses = new ArrayList<>();
    PapyrusRenderCompletion completion = new PapyrusRenderCompletion(statuses::add);

    assertTrue(completion.complete(PapyrusRenderCompletion.Status.READY));
    assertFalse(completion.complete(PapyrusRenderCompletion.Status.STALE));
    assertEquals(1, statuses.size());
    assertEquals(PapyrusRenderCompletion.Status.READY, statuses.get(0));
  }

  @Test
  public void staleAndCancellationAreValidTerminals() {
    for (PapyrusRenderCompletion.Status status : new PapyrusRenderCompletion.Status[] {
      PapyrusRenderCompletion.Status.STALE,
      PapyrusRenderCompletion.Status.CANCELLED
    }) {
      List<PapyrusRenderCompletion.Status> statuses = new ArrayList<>();
      PapyrusRenderCompletion completion = new PapyrusRenderCompletion(statuses::add);
      assertTrue(completion.complete(status));
      assertEquals(status, statuses.get(0));
    }
  }
}
