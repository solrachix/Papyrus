package com.papyrus.engine;

import androidx.annotation.NonNull;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

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
