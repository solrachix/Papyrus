package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import java.util.concurrent.ThreadPoolExecutor;

import org.junit.Test;

public final class PapyrusComicPreviewExecutorTest {
  @Test public void previewWorkUsesOneLowPriorityWorkerAndABoundedQueue() {
    assertEquals("E_COMIC_PREVIEW_QUEUE_FULL", PapyrusComicPreviewExecutor.QUEUE_FULL_ERROR_CODE);
    ThreadPoolExecutor executor = PapyrusComicPreviewExecutor.create();
    try {
      assertEquals(1, executor.getCorePoolSize());
      assertEquals(1, executor.getMaximumPoolSize());
      assertEquals(2, executor.getQueue().remainingCapacity());
      assertEquals(Thread.MIN_PRIORITY, executor.getThreadFactory().newThread(() -> {}).getPriority());
      assertNotNull(executor.getRejectedExecutionHandler());
    } finally {
      executor.shutdownNow();
    }
  }
}
