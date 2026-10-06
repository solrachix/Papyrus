package com.papyrus.engine;

import java.util.concurrent.ConcurrentHashMap;

final class PapyrusTextStore {
  private static final class Document {
    final int generation;
    final String text;
    Document(int generation, String text) { this.generation = generation; this.text = text; }
  }

  private static final ConcurrentHashMap<String, Document> DOCUMENTS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Integer> CLOSED_GENERATIONS = new ConcurrentHashMap<>();
  private static final java.util.Set<String> DESTROYED = ConcurrentHashMap.newKeySet();

  private PapyrusTextStore() {}

  static synchronized void setText(String engineId, int generation, String text) {
    if (engineId == null || engineId.isEmpty() || DESTROYED.contains(engineId)) return;
    if (generation <= CLOSED_GENERATIONS.getOrDefault(engineId, -1)) return;
    DOCUMENTS.compute(engineId, (key, current) ->
      current == null || generation >= current.generation ? new Document(generation, text) : current);
  }

  static String getText(String engineId, int generation) {
    Document document = DOCUMENTS.get(engineId);
    return document != null && document.generation == generation ? document.text : null;
  }

  static synchronized void close(String engineId, int generation) {
    if (engineId == null || engineId.isEmpty()) return;
    CLOSED_GENERATIONS.merge(engineId, generation, Math::max);
    DOCUMENTS.computeIfPresent(engineId, (key, current) ->
      current.generation <= generation ? null : current);
  }

  static synchronized void close(String engineId) {
    if (engineId == null || engineId.isEmpty()) return;
    DOCUMENTS.remove(engineId);
    DESTROYED.add(engineId);
    CLOSED_GENERATIONS.remove(engineId);
  }
}
