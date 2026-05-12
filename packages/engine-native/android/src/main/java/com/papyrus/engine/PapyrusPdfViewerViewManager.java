package com.papyrus.engine;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

import java.util.ArrayList;
import java.util.List;
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
        "onPageChange",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onPageChange")
        )
      )
      .put(
        "onZoomChanged",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onZoomChanged")
        )
      )
      .put(
        "onZoomChange",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onZoomChange")
        )
      )
      .put(
        "onVisiblePagesChange",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onVisiblePagesChange")
        )
      )
      .put(
        "onAnnotationCreated",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onAnnotationCreated")
        )
      )
      .put(
        "onTap",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onTap")
        )
      )
      .put(
        "onAnnotationTap",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onAnnotationTap")
        )
      )
      .put(
        "onTextSelected",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onTextSelected")
        )
      )
      .put(
        "onScroll",
        com.facebook.react.common.MapBuilder.of(
          "phasedRegistrationNames",
          com.facebook.react.common.MapBuilder.of("bubbled", "onScroll")
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

  @ReactProp(name = "activeTool")
  public void setActiveTool(PapyrusPdfViewerView view, String activeTool) {
    view.setActiveTool(activeTool);
  }

  @ReactProp(name = "annotationColor")
  public void setAnnotationColor(PapyrusPdfViewerView view, String annotationColor) {
    view.setAnnotationColor(annotationColor);
  }

  @ReactProp(name = "inkStrokeWidth", defaultFloat = 0.006f)
  public void setInkStrokeWidth(PapyrusPdfViewerView view, float inkStrokeWidth) {
    view.setInkStrokeWidth(inkStrokeWidth);
  }

  @ReactProp(name = "annotationOpacity", defaultFloat = 0.85f)
  public void setAnnotationOpacity(PapyrusPdfViewerView view, float annotationOpacity) {
    view.setAnnotationOpacity(annotationOpacity);
  }

  @ReactProp(name = "selectionActive", defaultBoolean = false)
  public void setSelectionActive(PapyrusPdfViewerView view, boolean selectionActive) {
    view.setSelectionActive(selectionActive);
  }

  @ReactProp(name = "viewMode")
  public void setViewMode(PapyrusPdfViewerView view, String viewMode) {
    view.setViewMode(viewMode);
  }

  @ReactProp(name = "searchResults")
  public void setSearchResults(PapyrusPdfViewerView view, ReadableArray searchResults) {
    List<PapyrusPdfViewerView.SearchResult> results = new ArrayList<>();
    if (searchResults != null) {
      for (int i = 0; i < searchResults.size(); i++) {
        ReadableMap item = searchResults.getMap(i);
        if (item == null) continue;
        int pageIndex = item.hasKey("pageIndex") ? item.getInt("pageIndex") : 0;
        List<PapyrusPdfViewerView.NormalizedRect> rects = new ArrayList<>();
        if (item.hasKey("rects")) {
          ReadableArray rectArray = item.getArray("rects");
          if (rectArray != null) {
            for (int j = 0; j < rectArray.size(); j++) {
              ReadableMap r = rectArray.getMap(j);
              if (r == null) continue;
              rects.add(new PapyrusPdfViewerView.NormalizedRect(
                (float) r.getDouble("x"),
                (float) r.getDouble("y"),
                (float) r.getDouble("width"),
                (float) r.getDouble("height")
              ));
            }
          }
        }
        results.add(new PapyrusPdfViewerView.SearchResult(pageIndex, rects));
      }
    }
    view.setSearchResults(results);
  }

  @ReactProp(name = "annotations")
  public void setAnnotations(PapyrusPdfViewerView view, ReadableArray annotations) {
    List<PapyrusPdfViewerView.Annotation> items = new ArrayList<>();
    if (annotations != null) {
      for (int i = 0; i < annotations.size(); i++) {
        ReadableMap item = annotations.getMap(i);
        if (item == null) continue;
        String id = item.hasKey("id") ? item.getString("id") : "";
        int pageIndex = item.hasKey("pageIndex") ? item.getInt("pageIndex") : 0;
        String type = item.hasKey("type") ? item.getString("type") : "highlight";
        String color = item.hasKey("color") ? item.getString("color") : "#FFFF00";
        List<PapyrusPdfViewerView.NormalizedRect> rects = new ArrayList<>();
        if (item.hasKey("rects")) {
          ReadableArray rectArray = item.getArray("rects");
          if (rectArray != null) {
            for (int j = 0; j < rectArray.size(); j++) {
              ReadableMap r = rectArray.getMap(j);
              if (r == null) continue;
              rects.add(new PapyrusPdfViewerView.NormalizedRect(
                (float) r.getDouble("x"),
                (float) r.getDouble("y"),
                (float) r.getDouble("width"),
                (float) r.getDouble("height")
              ));
            }
          }
        } else if (item.hasKey("rect")) {
          ReadableMap r = item.getMap("rect");
          if (r != null) {
            rects.add(new PapyrusPdfViewerView.NormalizedRect(
              (float) r.getDouble("x"),
              (float) r.getDouble("y"),
              (float) r.getDouble("width"),
              (float) r.getDouble("height")
            ));
          }
        }
        List<PapyrusPdfViewerView.NormalizedPoint> path = null;
        if (item.hasKey("path")) {
          ReadableArray pathArray = item.getArray("path");
          if (pathArray != null) {
            path = new ArrayList<>();
            for (int j = 0; j < pathArray.size(); j++) {
              ReadableMap p = pathArray.getMap(j);
              if (p == null) continue;
              path.add(new PapyrusPdfViewerView.NormalizedPoint(
                (float) p.getDouble("x"),
                (float) p.getDouble("y")
              ));
            }
          }
        }
        float strokeWidth = item.hasKey("strokeWidth") ? (float) item.getDouble("strokeWidth") : 0.006f;
        float opacity = item.hasKey("opacity") ? (float) item.getDouble("opacity") : 0.85f;
        items.add(new PapyrusPdfViewerView.Annotation(id, pageIndex, type, color, rects, path, strokeWidth, opacity));
      }
    }
    view.setAnnotations(items);
  }
}
