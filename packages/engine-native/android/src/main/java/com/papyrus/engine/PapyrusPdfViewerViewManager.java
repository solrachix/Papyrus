package com.papyrus.engine;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactContext;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public class PapyrusPdfViewerViewManager extends SimpleViewManager<PapyrusPdfViewerView> {
  @NonNull
  @Override
  public String getName() {
    return "PapyrusPdfViewerView";
  }

  @NonNull
  @Override
  protected PapyrusPdfViewerView createViewInstance(@NonNull ThemedReactContext reactContext) {
    return new PapyrusPdfViewerView(reactContext);
  }

  @Nullable
  @Override
  public Map<String, Object> getExportedCustomBubblingEventTypeConstants() {
    return com.facebook.react.common.MapBuilder.<String, Object>builder()
      .put(
        "onPageChanged",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onPageChanged")
        )
      )
      .put(
        "onZoomChanged",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onZoomChanged")
        )
      )
      .build();
  }

  @ReactProp(name = "engineId")
  public void setEngineId(PapyrusPdfViewerView view, String engineId) {
    view.setEngineId(engineId);
  }

  @ReactProp(name = "pageTheme")
  public void setPageTheme(PapyrusPdfViewerView view, String pageTheme) {
    view.setPageTheme(pageTheme);
  }

  @ReactProp(name = "zoom", defaultFloat = 1.0f)
  public void setZoom(PapyrusPdfViewerView view, float zoom) {
    view.setZoom(zoom);
  }

  @ReactProp(name = "currentPage", defaultInt = 1)
  public void setCurrentPage(PapyrusPdfViewerView view, int currentPage) {
    view.setCurrentPage(currentPage);
  }
}
