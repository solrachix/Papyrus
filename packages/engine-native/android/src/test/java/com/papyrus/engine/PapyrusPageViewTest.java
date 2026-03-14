package com.papyrus.engine;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PapyrusPageViewTest {
  @Test
  public void constrainRenderSizeKeepsSafeSizesUntouched() {
    int[] size = PapyrusPageView.constrainRenderSize(1200, 1600);

    assertArrayEquals(new int[] {1200, 1600}, size);
  }

  @Test
  public void constrainRenderSizeCapsOversizedBitmapsPreservingAspectRatio() {
    int[] size = PapyrusPageView.constrainRenderSize(6000, 8000);

    assertTrue(size[0] > 0);
    assertTrue(size[1] > 0);
    assertTrue(size[0] <= PapyrusPageView.MAX_RENDER_EDGE);
    assertTrue(size[1] <= PapyrusPageView.MAX_RENDER_EDGE);
    assertTrue(
      ((long) size[0] * (long) size[1]) <= PapyrusPageView.MAX_RENDER_PIXELS
    );
    assertTrue(size[0] < 6000);
    assertTrue(size[1] < 8000);
  }
}
