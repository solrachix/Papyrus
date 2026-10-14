package com.papyrus.engine;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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
  }

  @Test public void continuousZoomKeepsThePointOnTheFocusedPageInPlace() {
    // The pinch is over the second page: 150 px into a 700 px item.
    assertEquals(550, PapyrusComicPageLayout.zoomAnchorTopForItem(700, 850f, 700, 1f, 2f));
    // The bottom edge remains the focus when the pinch starts at the page bottom.
    assertEquals(500, PapyrusComicPageLayout.zoomAnchorTopForItem(900, 1300f, 400, 1f, 2f));
  }

  @Test public void delayedAnchorRestoreIsInvalidatedWhenDocumentOrLayoutChanges() {
    assertTrue(PapyrusComicPageLayout.canRestoreAnchor("book-a", 7, "book-a", 7, true, 3, 10));
    assertFalse(PapyrusComicPageLayout.canRestoreAnchor("book-a", 7, "book-a", 8, true, 3, 10));
    assertFalse(PapyrusComicPageLayout.canRestoreAnchor("book-a", 7, "book-b", 7, true, 3, 10));
    assertFalse(PapyrusComicPageLayout.canRestoreAnchor("book-a", 7, "book-a", 7, false, 3, 10));
    assertFalse(PapyrusComicPageLayout.canRestoreAnchor("book-a", 7, "book-a", 7, true, 10, 10));
  }

  @Test public void invalidImageDimensionsFallBackToViewportHeight() {
    assertEquals(700, PapyrusComicPageLayout.itemHeight(0, 800, 400, 700, "continuous", "width"));
    assertEquals(700, PapyrusComicPageLayout.itemHeight(400, 0, 400, 700, "continuous", "width"));
    assertEquals(1400, PapyrusComicPageLayout.zoomedHeight(0, 0, 400, 700, "continuous", "width", 2f));
  }

  @Test public void continuousZoomFallbackUsesTheSameViewportGeometryForUnindexedPages() {
    assertEquals(700, PapyrusComicPageLayout.zoomedFallbackHeight(400, 700, "continuous", "width", 1f));
    assertEquals(1400, PapyrusComicPageLayout.zoomedFallbackHeight(400, 700, "continuous", "width", 2f));
    assertEquals(700, PapyrusComicPageLayout.zoomedFallbackHeight(400, 700, "single", "width", 2f));
  }

  @Test public void changingLayoutConvertsCenteredAndLeftAlignedZoomCoordinates() {
    assertEquals(-200f, PapyrusComicPageLayout.panForLayout(-400f, 400, 2f, false), 0.01f);
    assertEquals(200f, PapyrusComicPageLayout.panForLayout(0f, 400, 2f, false), 0.01f);
    assertEquals(-400f, PapyrusComicPageLayout.panForLayout(-200f, 400, 2f, true), 0.01f);
    assertEquals(0f, PapyrusComicPageLayout.panForLayout(200f, 400, 2f, true), 0.01f);
    assertEquals(0f, PapyrusComicPageLayout.panForLayout(100f, 400, 1f, true), 0.01f);
  }
}
