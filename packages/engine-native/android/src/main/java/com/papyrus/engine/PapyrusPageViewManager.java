package com.papyrus.engine;

import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;

public class PapyrusPageViewManager extends SimpleViewManager<PapyrusPageView> {
  @Override
  public String getName() {
    return "PapyrusPageView";
  }

  @Override
  protected PapyrusPageView createViewInstance(ThemedReactContext reactContext) {
    return new PapyrusPageView(reactContext);
  }
}
