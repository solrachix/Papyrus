package com.papyrus.engine;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.Map;

public final class PapyrusTextDocumentViewManager extends SimpleViewManager<PapyrusTextDocumentView> {
  @NonNull @Override public String getName() { return "PapyrusTextDocumentView"; }

  @NonNull @Override protected PapyrusTextDocumentView createViewInstance(@NonNull ThemedReactContext context) {
    return new PapyrusTextDocumentView(context);
  }

  @Nullable @Override public Map<String, Object> getExportedCustomBubblingEventTypeConstants() {
    return MapBuilder.<String, Object>builder()
      .put("onTextOffsetChange", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onTextOffsetChange")))
      .put("onTextRangeSelected", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onTextRangeSelected")))
      .put("onDefineSelection", MapBuilder.of("phasedRegistrationNames", MapBuilder.of("bubbled", "onDefineSelection")))
      .build();
  }

  @ReactProp(name = "engineId") public void setEngineId(PapyrusTextDocumentView view, String value) { view.setEngineId(value); }
  @ReactProp(name = "documentGeneration", defaultInt = 0) public void setDocumentGeneration(PapyrusTextDocumentView view, int value) { view.setDocumentGeneration(value); }
  @ReactProp(name = "textLength", defaultInt = 0) public void setTextLength(PapyrusTextDocumentView view, int value) { view.setTextLength(value); }
  @ReactProp(name = "currentTextOffset", defaultInt = 0) public void setCurrentTextOffset(PapyrusTextDocumentView view, int value) { view.setCurrentTextOffset(value); }
  @ReactProp(name = "scrollToTextOffsetSignal") public void setScrollToTextOffsetSignal(PapyrusTextDocumentView view, Integer value) { view.setScrollToTextOffsetSignal(value); }
  @ReactProp(name = "searchResults") public void setSearchResults(PapyrusTextDocumentView view, ReadableArray value) { view.setSearchResults(value); }
  @ReactProp(name = "activeSearchIndex", defaultInt = -1) public void setActiveSearchIndex(PapyrusTextDocumentView view, int value) { view.setActiveSearchIndex(value); }
  @ReactProp(name = "pageTheme") public void setPageTheme(PapyrusTextDocumentView view, String value) { view.setPageTheme(value); }
  @ReactProp(name = "uiTheme") public void setUiTheme(PapyrusTextDocumentView view, String value) { view.setUiTheme(value); }
  @ReactProp(name = "fontSize", defaultFloat = 18f) public void setFontSize(PapyrusTextDocumentView view, float value) { view.setFontSize(value); }
  @ReactProp(name = "lineHeight", defaultFloat = 28f) public void setLineHeight(PapyrusTextDocumentView view, float value) { view.setLineHeight(value); }
  @ReactProp(name = "pageMargin", defaultFloat = 20f) public void setPageMargin(PapyrusTextDocumentView view, float value) { view.setPageMargin(value); }
  @ReactProp(name = "defineLabel") public void setDefineLabel(PapyrusTextDocumentView view, String value) { view.setDefineLabel(value); }
  @ReactProp(name = "defineSelectionMode") public void setDefineSelectionMode(PapyrusTextDocumentView view, String value) { view.setDefineSelectionMode(value); }
}
