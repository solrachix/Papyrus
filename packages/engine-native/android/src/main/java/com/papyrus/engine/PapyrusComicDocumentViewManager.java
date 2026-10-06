package com.papyrus.engine;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public final class PapyrusComicDocumentViewManager extends SimpleViewManager<PapyrusComicDocumentView> {
  @NonNull @Override public String getName() { return "PapyrusComicDocumentView"; }
  @NonNull @Override protected PapyrusComicDocumentView createViewInstance(@NonNull ThemedReactContext context) { return new PapyrusComicDocumentView(context); }
  @Nullable @Override public Map<String, Object> getExportedCustomBubblingEventTypeConstants() {
    return MapBuilder.<String, Object>builder()
      .put("onPageChanged", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onPageChanged")))
      .put("onZoomChanged", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onZoomChanged")))
      .put("onError", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onError")))
      .build();
  }
  @ReactProp(name="engineId") public void setEngineId(PapyrusComicDocumentView view, String value) { view.setEngineId(value); }
  @ReactProp(name="documentGeneration", defaultInt=0) public void setGeneration(PapyrusComicDocumentView view, int value) { view.setDocumentGeneration(value); }
  @ReactProp(name="pageCount", defaultInt=0) public void setPageCount(PapyrusComicDocumentView view, int value) { view.setPageCount(value); }
  @ReactProp(name="currentPage", defaultInt=1) public void setCurrentPage(PapyrusComicDocumentView view, int value) { view.setCurrentPage(value); }
  @ReactProp(name="layoutMode") public void setLayoutMode(PapyrusComicDocumentView view, String value) { view.setLayoutMode(value); }
  @ReactProp(name="fitMode") public void setFitMode(PapyrusComicDocumentView view, String value) { view.setFitMode(value); }
  @ReactProp(name="readingDirection") public void setReadingDirection(PapyrusComicDocumentView view, String value) { view.setReadingDirection(value); }
  @ReactProp(name="zoom", defaultFloat=1f) public void setZoom(PapyrusComicDocumentView view, float value) { view.setZoom(value); }
  @ReactProp(name="pageTheme") public void setPageTheme(PapyrusComicDocumentView view, String value) { view.setPageTheme(value); }
}
