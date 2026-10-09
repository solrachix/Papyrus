package com.papyrus.engine;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class PapyrusComicPageLayoutTest {
  @Test public void continuousPageHeightComesFromImageRatioEvenOnBitmapCacheHits() {
    assertEquals(800, PapyrusComicPageLayout.itemHeight(400, 800, 400, 700, "continuous", "width"));
    assertEquals(700, PapyrusComicPageLayout.itemHeight(400, 800, 400, 700, "continuous", "page"));
    assertEquals(700, PapyrusComicPageLayout.itemHeight(400, 800, 400, 700, "single", "width"));
  }

  @Test public void continuousZoomResizesGeometryWithoutCroppingTheImage() {
    assertEquals(800, PapyrusComicPageLayout.zoomedWidth(400, 2f));
    assertEquals(1600, PapyrusComicPageLayout.zoomedHeight(400, 800, 400, 700, "continuous", "width", 2f));
    assertEquals(1400, PapyrusComicPageLayout.zoomedHeight(400, 800, 400, 700, "continuous", "page", 2f));
    assertEquals(700, PapyrusComicPageLayout.zoomedHeight(400, 800, 400, 700, "single", "width", 2f));
    assertEquals(-300f, PapyrusComicPageLayout.clampPanX(-300f, 400, 2f), 0.01f);
    assertEquals(-400f, PapyrusComicPageLayout.clampPanX(-900f, 400, 2f), 0.01f);
    assertEquals(0f, PapyrusComicPageLayout.clampPanX(100f, 400, 2f), 0.01f);
    assertEquals(-300, PapyrusComicPageLayout.zoomAnchorTop(0, 300f, 1f, 2f));
  }

  @Test public void invalidImageDimensionsFallBackToViewportHeight() {
    assertEquals(700, PapyrusComicPageLayout.itemHeight(0, 800, 400, 700, "continuous", "width"));
    assertEquals(700, PapyrusComicPageLayout.itemHeight(400, 0, 400, 700, "continuous", "width"));
  }

  @Test public void changingLayoutConvertsCenteredAndLeftAlignedZoomCoordinates() {
    assertEquals(-200f, PapyrusComicPageLayout.panForLayout(-400f, 400, 2f, false), 0.01f);
    assertEquals(200f, PapyrusComicPageLayout.panForLayout(0f, 400, 2f, false), 0.01f);
    assertEquals(-400f, PapyrusComicPageLayout.panForLayout(-200f, 400, 2f, true), 0.01f);
    assertEquals(0f, PapyrusComicPageLayout.panForLayout(200f, 400, 2f, true), 0.01f);
    assertEquals(0f, PapyrusComicPageLayout.panForLayout(100f, 400, 1f, true), 0.01f);
  }
}
