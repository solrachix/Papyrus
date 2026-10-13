#pragma once

#include <math.h>
#include <stddef.h>

typedef struct {
  double originX;
  double originY;
  double width;
  double height;
} PapyrusComicLayoutFrame;

static inline double PapyrusComicClampZoom(double zoom) {
  return fmax(1.0, fmin(5.0, zoom));
}

static inline double PapyrusComicZoomedExtent(double extent, double zoom) {
  return fmax(1.0, extent) * PapyrusComicClampZoom(zoom);
}

static inline double PapyrusComicContinuousContentWidth(double viewportWidth, double zoom) {
  return PapyrusComicZoomedExtent(viewportWidth, zoom);
}

static inline double PapyrusComicContinuousDocumentHeight(
    const double *prefixHeights,
    size_t pageCount,
    double zoom) {
  if (prefixHeights == NULL || pageCount == 0) return 0.0;
  return fmax(0.0, prefixHeights[pageCount]) * PapyrusComicClampZoom(zoom);
}

static inline PapyrusComicLayoutFrame PapyrusComicContinuousPageFrame(
    const double *prefixHeights,
    size_t pageCount,
    size_t pageIndex,
    double viewportWidth,
    double zoom) {
  PapyrusComicLayoutFrame frame = {0.0, 0.0, 0.0, 0.0};
  if (prefixHeights == NULL || pageIndex >= pageCount) return frame;
  double scale = PapyrusComicClampZoom(zoom);
  double start = fmax(0.0, prefixHeights[pageIndex]);
  double end = fmax(start, prefixHeights[pageIndex + 1]);
  frame.originY = start * scale;
  frame.width = PapyrusComicContinuousContentWidth(viewportWidth, scale);
  frame.height = fmax(1.0, (end - start) * scale);
  return frame;
}

static inline size_t PapyrusComicContinuousFirstVisiblePage(
    const double *prefixHeights,
    size_t pageCount,
    double minY,
    double zoom) {
  if (prefixHeights == NULL || pageCount == 0) return pageCount;
  double scale = PapyrusComicClampZoom(zoom);
  size_t lower = 0;
  size_t upper = pageCount;
  while (lower < upper) {
    size_t middle = lower + (upper - lower) / 2;
    if (prefixHeights[middle + 1] * scale <= minY) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

static inline void PapyrusComicContinuousApplyHeightDeltas(
    double *prefixHeights,
    const double *heightDeltas,
    size_t pageCount) {
  if (prefixHeights == NULL || heightDeltas == NULL || pageCount == 0) return;
  double accumulatedDelta = 0.0;
  for (size_t boundary = 1; boundary <= pageCount; boundary++) {
    accumulatedDelta += heightDeltas[boundary - 1];
    prefixHeights[boundary] += accumulatedDelta;
  }
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
