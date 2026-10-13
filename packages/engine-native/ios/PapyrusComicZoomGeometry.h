#pragma once

#include <math.h>

static inline double PapyrusComicClampZoom(double zoom) {
  return fmax(1.0, fmin(5.0, zoom));
}

static inline double PapyrusComicZoomedExtent(double extent, double zoom) {
  return fmax(1.0, extent) * PapyrusComicClampZoom(zoom);
}

static inline double PapyrusComicContinuousPageHeight(
    double imageWidth,
    double imageHeight,
    double viewportWidth,
    double viewportHeight,
    int fitPage,
    double zoom) {
  double baseHeight = fmax(1.0, viewportHeight);
  if (imageWidth > 0.0 && imageHeight > 0.0 && viewportWidth > 0.0) {
    baseHeight = viewportWidth * imageHeight / imageWidth;
    if (fitPage && viewportHeight > 0.0) baseHeight = fmin(baseHeight, viewportHeight);
  }
  return fmax(1.0, baseHeight) * PapyrusComicClampZoom(zoom);
}

static inline double PapyrusComicZoomAnchorFraction(
    double contentOffset,
    double focusInViewport,
    double itemOrigin,
    double itemExtent) {
  if (itemExtent <= 0.0) return 0.0;
  double fraction = (contentOffset + focusInViewport - itemOrigin) / itemExtent;
  return fmax(0.0, fmin(1.0, fraction));
}

static inline double PapyrusComicZoomAnchorOffset(
    double itemOrigin,
    double itemExtent,
    double fraction,
    double focusInViewport,
    double contentExtent,
    double viewportExtent,
    double leadingInset,
    double trailingInset) {
  double minimum = -leadingInset;
  double maximum = fmax(minimum, contentExtent - viewportExtent + trailingInset);
  double anchor = itemOrigin + itemExtent * fmax(0.0, fmin(1.0, fraction));
  double offset = anchor - focusInViewport;
  return fmax(minimum, fmin(maximum, offset));
}
