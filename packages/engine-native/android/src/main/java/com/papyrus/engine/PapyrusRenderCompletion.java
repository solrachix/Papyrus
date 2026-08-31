package com.papyrus.engine;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

final class PapyrusRenderCompletion {
  enum Status { READY, STALE, CANCELLED }

  private final AtomicBoolean completed = new AtomicBoolean(false);
  private final Consumer<Status> listener;
  private final Consumer<Throwable> errorListener;

  PapyrusRenderCompletion(Consumer<Status> listener) {
    this(listener, error -> { });
  }

  PapyrusRenderCompletion(Consumer<Status> listener, Consumer<Throwable> errorListener) {
    this.listener = listener;
    this.errorListener = errorListener;
  }

  boolean complete(Status status) {
    if (!completed.compareAndSet(false, true)) return false;
    listener.accept(status);
    return true;
  }

  boolean error(Throwable error) {
    if (!completed.compareAndSet(false, true)) return false;
    errorListener.accept(error);
    return true;
  }
}
