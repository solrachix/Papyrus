package com.papyrus.engine;

import android.os.SystemClock;
import android.util.Log;

import com.facebook.react.bridge.ReadableMap;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

final class PapyrusNativeRenderTelemetry {
  private static final String TAG = "PapyrusNativePerf";
  private final boolean enabled;
  private final Map<String, Object> context;
  private final AtomicBoolean drawEmitted = new AtomicBoolean(false);
  private final AtomicBoolean drawEnded = new AtomicBoolean(false);

  private PapyrusNativeRenderTelemetry(boolean enabled, Map<String, Object> context) {
    this.enabled = enabled;
    this.context = context;
  }

  static PapyrusNativeRenderTelemetry from(
      ReadableMap input,
      String renderRequestId,
      String surfaceId,
      int pageIndex,
      int target,
      int generation) {
    Map<String, Object> context = new HashMap<>();
    context.put("renderRequestId", renderRequestId);
    context.put("surfaceId", surfaceId);
    context.put("pageIndex", pageIndex);
    context.put("target", target);
    context.put("generation", generation);
    boolean enabled = false;
    if (input != null) {
      enabled = input.hasKey("enabled") && !input.isNull("enabled") && input.getBoolean("enabled");
      copyString(input, context, "runId");
      copyString(input, context, "sampleId");
      copyString(input, context, "documentLoadId");
      copyString(input, context, "fixture");
      if (input.hasKey("generation") && !input.isNull("generation")) {
        context.put("generation", input.getInt("generation"));
      }
      if (input.hasKey("pageIndex") && !input.isNull("pageIndex")) {
        context.put("pageIndex", input.getInt("pageIndex"));
      }
      if (input.hasKey("surfaceId") && !input.isNull("surfaceId")) {
        context.put("surfaceId", input.getString("surfaceId"));
      }
    }
    return new PapyrusNativeRenderTelemetry(enabled, context);
  }

  private static void copyString(ReadableMap input, Map<String, Object> output, String key) {
    if (input.hasKey(key) && !input.isNull(key)) {
      output.put(key, input.getString(key));
    }
  }

  boolean isEnabled() {
    return enabled;
  }

  void emit(String name) {
    if (!enabled) return;
    Log.i(TAG, "[Papyrus Native Perf] " + buildEventJson(name, SystemClock.elapsedRealtimeNanos(), context));
  }

  void traceBegin(String section) {
    if (enabled) android.os.Trace.beginSection(section);
  }

  void traceEnd() {
    if (enabled) android.os.Trace.endSection();
  }

  void emitDrawOnce() {
    if (drawEmitted.compareAndSet(false, true)) {
      emit("native.draw.start");
    }
  }

  void emitDrawEnd() {
    if (enabled && drawEmitted.get() && drawEnded.compareAndSet(false, true)) {
      emit("native.draw.end");
    }
  }

  void emitCachePut() {
    emit("native.render.cache.put");
  }

  void emitCacheEvict() {
    emit("native.render.cache.evict");
  }

  static String buildEventJson(String name, long timestampNs, Map<String, Object> context) {
    StringBuilder json = new StringBuilder("{\"name\":");
    json.append(jsonValue(name));
    json.append(",\"timestampNs\":").append(timestampNs);
    for (Map.Entry<String, Object> entry : context.entrySet()) {
      if (entry.getValue() != null) {
        json.append(',').append(jsonValue(entry.getKey())).append(':').append(jsonValue(entry.getValue()));
      }
    }
    return json.append('}').toString();
  }

  private static String jsonValue(Object value) {
    if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
    String text = String.valueOf(value);
    return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"")
      .replace("\n", "\\n").replace("\r", "\\r") + "\"";
  }
}
