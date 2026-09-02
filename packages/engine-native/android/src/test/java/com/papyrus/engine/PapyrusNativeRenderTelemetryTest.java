package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

public class PapyrusNativeRenderTelemetryTest {
  @Test
  public void eventContainsMonotonicTimestampAndRenderIdentity() throws Exception {
    Map<String, Object> context = new HashMap<>();
    context.put("renderRequestId", "render-1");
    context.put("surfaceId", "page-4");
    context.put("pageIndex", 4);
    context.put("generation", 7);

    String event = PapyrusNativeRenderTelemetry.buildEventJson("native.render.request", 123456789L, context);
    assertTrue(event.contains("\"name\":\"native.render.request\""));
    assertTrue(event.contains("\"timestampNs\":123456789"));
    assertTrue(event.contains("\"renderRequestId\":\"render-1\""));
    assertTrue(event.contains("\"surfaceId\":\"page-4\""));
    assertTrue(event.contains("\"pageIndex\":4"));
    assertTrue(event.contains("\"generation\":7"));
  }

  @Test
  public void telemetryIsOptIn() {
    PapyrusNativeRenderTelemetry disabled = PapyrusNativeRenderTelemetry.from(
      null, "render-1", "page-1", 0, 42, 1
    );
    assertFalse(disabled.isEnabled());
    assertTrue(PapyrusNativeRenderTelemetry.buildEventJson("native.draw.start", 1L, new HashMap<>()).contains("native.draw.start"));
  }
}
