package com.papyrus.engine;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public final class PapyrusComicPageLayoutTest {
  @Test public void continuousPageHeightComesFromImageRatioEvenOnBitmapCacheHits() {
    assertEquals(800, PapyrusComicPageLayout.itemHeight(400, 800, 400, 700, "continuous", "width"));
    assertEquals(700, PapyrusComicPageLayout.itemHeight(400, 800, 400, 700, "continuous", "page"));
    assertEquals(700, PapyrusComicPageLayout.itemHeight(400, 800, 400, 700, "single", "width"));
  }

  @Test public void invalidImageDimensionsFallBackToViewportHeight() {
    assertEquals(700, PapyrusComicPageLayout.itemHeight(0, 800, 400, 700, "continuous", "width"));
    assertEquals(700, PapyrusComicPageLayout.itemHeight(400, 0, 400, 700, "continuous", "width"));
  }
}
