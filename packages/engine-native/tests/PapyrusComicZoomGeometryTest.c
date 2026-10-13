#include <assert.h>
#include <math.h>
#include <stdio.h>
#include "../ios/PapyrusComicZoomGeometry.h"

static void assert_near(double actual, double expected) {
  if (fabs(actual - expected) >= 0.01) fprintf(stderr, "expected %.3f, got %.3f\n", expected, actual);
  assert(fabs(actual - expected) < 0.01);
}

int main(void) {
  assert_near(PapyrusComicClampZoom(0.5), 1.0);
  assert_near(PapyrusComicClampZoom(2.75), 2.75);
  assert_near(PapyrusComicClampZoom(8.0), 5.0);

  assert_near(PapyrusComicZoomedExtent(400.0, 2.0), 800.0);
  assert_near(PapyrusComicZoomedExtent(0.0, 3.0), 3.0);
  assert_near(PapyrusComicContinuousPageHeight(400.0, 800.0, 400.0, 700.0, 0, 2.0), 1600.0);
  assert_near(PapyrusComicContinuousPageHeight(400.0, 800.0, 400.0, 700.0, 1, 2.0), 1400.0);
  assert_near(PapyrusComicContinuousPageHeight(600.0, 900.0, 400.0, 700.0, 0, 1.0), 600.0);
  assert_near(PapyrusComicContinuousPageHeight(0.0, 900.0, 400.0, 700.0, 0, 2.0), 1400.0);

  double fraction = PapyrusComicZoomAnchorFraction(700.0, 200.0, 500.0, 1000.0);
  assert_near(fraction, 0.4);
  assert_near(PapyrusComicZoomAnchorFraction(0.0, 0.0, 100.0, 0.0), 0.0);

  // After zoom, the same relative point stays under the fingers.
  assert_near(PapyrusComicZoomAnchorOffset(1000.0, 2000.0, fraction, 200.0, 4000.0, 700.0, 0.0, 0.0), 1600.0);
  const double focusPoints[] = {40.0, 350.0, 660.0};
  for (unsigned int i = 0; i < sizeof(focusPoints) / sizeof(focusPoints[0]); i++) {
    double oldOrigin = 300.0;
    double oldExtent = 900.0;
    double oldOffset = 250.0;
    double currentFraction = PapyrusComicZoomAnchorFraction(oldOffset, focusPoints[i], oldOrigin, oldExtent);
    double newOrigin = oldOrigin * 2.0;
    double newExtent = oldExtent * 2.0;
    double newOffset = PapyrusComicZoomAnchorOffset(newOrigin, newExtent, currentFraction, focusPoints[i], 5000.0, 700.0, 0.0, 0.0);
    assert_near(newOffset + focusPoints[i] - newOrigin, currentFraction * newExtent);
  }
  // Content edges clamp offsets when the focal point would move beyond the document.
  assert_near(PapyrusComicZoomAnchorOffset(0.0, 800.0, 0.0, 100.0, 800.0, 700.0, 0.0, 0.0), 0.0);
  assert_near(PapyrusComicZoomAnchorOffset(0.0, 800.0, 1.0, 0.0, 800.0, 700.0, 0.0, 0.0), 100.0);
  assert_near(PapyrusComicZoomAnchorOffset(0.0, 600.0, 0.5, 10.0, 600.0, 700.0, 20.0, 0.0), -20.0);
  return 0;
}
