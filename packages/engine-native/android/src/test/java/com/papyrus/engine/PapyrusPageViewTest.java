package com.papyrus.engine;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;

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
  public void buildRenderKeyIncludesDocumentViewportAndScaleInputs() {
    String key = PapyrusRenderMath.buildRenderKey("/tmp/sample.pdf", 0, 3, 1200, 1600, 1.2345f, 90);

    assertTrue(key.contains("/tmp/sample.pdf"));
    assertTrue(key.contains(":3:"));
    assertTrue(key.contains(":1200x1600:"));
    assertTrue(key.endsWith(":1235:90"));
  }
}
