package com.papyrus.engine;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Keeps optional thumbnail work bounded and away from the archive load queue. */
final class PapyrusComicPreviewExecutor {
  static final String QUEUE_FULL_ERROR_CODE = "E_COMIC_PREVIEW_QUEUE_FULL";

  private PapyrusComicPreviewExecutor() {}

  static ThreadPoolExecutor create() {
    return new ThreadPoolExecutor(
      1,
      1,
      30L,
      TimeUnit.SECONDS,
      new ArrayBlockingQueue<>(2),
      runnable -> {
        Thread thread = new Thread(runnable, "papyrus-comic-preview");
        thread.setPriority(Thread.MIN_PRIORITY);
        return thread;
      },
      new ThreadPoolExecutor.AbortPolicy()
    );
  }
}
