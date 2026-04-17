package com.papyrus.engine;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

public class PapyrusPageViewManager extends SimpleViewManager<PapyrusPageView> {
  @Override
  public String getName() {
    return "PapyrusPageView";
  }

  @Override
  protected PapyrusPageView createViewInstance(ThemedReactContext reactContext) {
    return new PapyrusPageView(reactContext);
  }

  @ReactProp(name = "pageTheme")
  public void setPageTheme(PapyrusPageView view, String pageTheme) {
    view.setPageTheme(pageTheme);
  }
}
