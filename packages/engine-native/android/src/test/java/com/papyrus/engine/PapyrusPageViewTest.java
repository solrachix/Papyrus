package com.papyrus.engine;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;

import java.lang.reflect.Field;

import org.junit.Test;

public class PapyrusPageViewTest {
  @Test
  public void constrainRenderSizeKeepsSafeSizesUntouched() {
    int[] size = PapyrusRenderMath.constrainRenderSize(1200, 1600);

    assertArrayEquals(new int[] {1200, 1600}, size);
  }

  @Test
  public void constrainRenderSizeCapsOversizedBitmapsPreservingAspectRatio() {
    int[] size = PapyrusRenderMath.constrainRenderSize(6000, 8000);

    assertTrue(size[0] > 0);
    assertTrue(size[1] > 0);
    assertTrue(size[0] <= PapyrusRenderMath.MAX_RENDER_EDGE);
    assertTrue(size[1] <= PapyrusRenderMath.MAX_RENDER_EDGE);
    assertTrue(
      ((long) size[0] * (long) size[1]) <= PapyrusRenderMath.MAX_RENDER_PIXELS
    );
    assertTrue(size[0] < 6000);
    assertTrue(size[1] < 8000);
  }

  @Test
  public void constrainRenderSizeKeepsLandscapeRotationWithinSafeEdge() {
    int[] size = PapyrusRenderMath.constrainCompatRenderSize(2180, 2822);

    assertArrayEquals(new int[] {1582, 2048}, size);
  }

  @Test
  public void buildRenderKeyIncludesDocumentViewportAndScaleInputs() {
    String key = PapyrusRenderMath.buildRenderKey("/tmp/sample.pdf", 0, 3, 1200, 1600, 1.2345f, 90);

    assertTrue(key.contains("/tmp/sample.pdf"));
    assertTrue(key.contains(":3:"));
    assertTrue(key.contains(":1200x1600:"));
    assertTrue(key.endsWith(":1235:90"));
  }

  @Test
  public void evictedBitmapIsRecycledOnlyAfterAllPageViewsReleaseIt() {
    assertTrue(PapyrusBitmapOwnership.shouldRecycleEvictedBitmap(false, 0));
    assertTrue(!PapyrusBitmapOwnership.shouldRecycleEvictedBitmap(true, 0));
    assertTrue(!PapyrusBitmapOwnership.shouldRecycleEvictedBitmap(false, 1));
  }

  @Test
  public void disposingPageViewClearsSurfaceAndInvalidatesPendingRender() throws Exception {
    PapyrusPageView view = new PapyrusPageView(null);
    Field generationField = PapyrusPageView.class.getDeclaredField("renderGeneration");
    generationField.setAccessible(true);
    generationField.setInt(view, 7);

    view.dispose();

    Field bitmapField = PapyrusPageView.class.getDeclaredField("bitmap");
    bitmapField.setAccessible(true);
    assertTrue(bitmapField.get(view) == null);
    assertTrue(generationField.getInt(view) == 8);
  }
}
