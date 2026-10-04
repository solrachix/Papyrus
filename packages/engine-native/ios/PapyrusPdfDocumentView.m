#import "PapyrusPdfDocumentView.h"

#import <QuartzCore/QuartzCore.h>
#import <dispatch/dispatch.h>
#import <math.h>

#import "PapyrusEngineStore.h"

static const CGFloat PapyrusPdfMinimumZoom = 0.5;
static const CGFloat PapyrusPdfMaximumZoom = 4.0;
static const CGFloat PapyrusPdfZoomEventTolerance = 0.02;
static const NSTimeInterval PapyrusPdfZoomEventInterval = 0.10;
static const NSTimeInterval PapyrusPdfScrollEventInterval = 0.08;
static void *PapyrusPdfScrollObservationContext = &PapyrusPdfScrollObservationContext;

@interface PapyrusPdfDocumentView ()
@property (nonatomic, strong) PDFView *pdfView;
@property (nonatomic, weak) UIScrollView *observedScrollView;
@property (nonatomic, strong) UITapGestureRecognizer *tapRecognizer;
@property (nonatomic, assign) CGSize lastLayoutSize;
@property (nonatomic, assign) NSInteger lastEmittedPage;
@property (nonatomic, assign) CGFloat lastEmittedZoom;
@property (nonatomic, copy) NSString *lastVisiblePagesSignature;
@property (nonatomic, assign) BOOL zoomEventScheduled;
@property (nonatomic, assign) BOOL scrollEventScheduled;
@property (nonatomic, assign) CGFloat pendingScrollOffsetY;
@property (nonatomic, assign) CFTimeInterval lastScrollEventTime;
@end

@implementation PapyrusPdfDocumentView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (!self) return nil;

  _pageTheme = @"normal";
  _viewMode = @"continuous";
  _zoom = 1.0;
  _currentPage = 1;
  _lastEmittedPage = NSNotFound;
  _lastEmittedZoom = NAN;
  _lastLayoutSize = CGSizeZero;
  self.clipsToBounds = YES;
  self.backgroundColor = UIColor.whiteColor;

  _pdfView = [[PDFView alloc] initWithFrame:CGRectZero];
  _pdfView.displayBox = kPDFDisplayBoxCropBox;
  _pdfView.displayDirection = kPDFDisplayDirectionVertical;
  _pdfView.displayMode = kPDFDisplaySinglePageContinuous;
  _pdfView.displaysPageBreaks = YES;
  _pdfView.autoScales = YES;
  _pdfView.userInteractionEnabled = YES;
  _pdfView.backgroundColor = UIColor.whiteColor;
  _pdfView.clipsToBounds = YES;
  [self addSubview:_pdfView];

  _tapRecognizer = [[UITapGestureRecognizer alloc]
      initWithTarget:self
              action:@selector(handleDocumentTap:)];
  _tapRecognizer.delegate = self;
  _tapRecognizer.cancelsTouchesInView = NO;
  _tapRecognizer.delaysTouchesBegan = NO;
  [_pdfView addGestureRecognizer:_tapRecognizer];

  NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
  [center addObserver:self
             selector:@selector(handlePdfPageChanged:)
                 name:PDFViewPageChangedNotification
               object:_pdfView];
  [center addObserver:self
             selector:@selector(handlePdfScaleChanged:)
                 name:PDFViewScaleChangedNotification
               object:_pdfView];
  [center addObserver:self
             selector:@selector(handlePdfVisiblePagesChanged:)
                 name:PDFViewVisiblePagesChangedNotification
               object:_pdfView];
  [center addObserver:self
             selector:@selector(handleStoredDocumentChanged:)
                 name:PapyrusEngineStoreDocumentDidChangeNotification
               object:[PapyrusEngineStore shared]];

  return self;
}

- (void)dealloc {
  [self stopObservingScrollView];
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  self.tapRecognizer.delegate = nil;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  self.pdfView.frame = self.bounds;

  if (!CGSizeEqualToSize(self.lastLayoutSize, self.bounds.size)) {
    self.lastLayoutSize = self.bounds.size;
    [self updateFitScalePreservingViewport];
  }

  [self refreshScrollViewObservation];
  [self emitVisiblePagesIfNeeded];
}

- (void)setEngineId:(NSString *)engineId {
  NSString *normalized = engineId.length > 0 ? [engineId copy] : nil;
  if ((_engineId == normalized) || [_engineId isEqualToString:normalized]) return;
  _engineId = normalized;
  [self reloadDocumentFromStore];
}

- (void)setPageTheme:(NSString *)pageTheme {
  _pageTheme = pageTheme.length > 0 ? [pageTheme copy] : @"normal";
  // Non-normal page themes route to the compatibility viewer in JavaScript.
  self.backgroundColor = UIColor.whiteColor;
  self.pdfView.backgroundColor = UIColor.whiteColor;
}

- (void)setViewMode:(NSString *)viewMode {
  NSString *normalized = [viewMode isEqualToString:@"single"] ? @"single" : @"continuous";
  if ([_viewMode isEqualToString:normalized]) return;
  PDFPage *currentPage = self.pdfView.currentPage;
  _viewMode = normalized;
  self.pdfView.displayMode = [normalized isEqualToString:@"single"]
      ? kPDFDisplaySinglePage
      : kPDFDisplaySinglePageContinuous;
  [self updateFitScalePreservingViewport];
  if (currentPage) {
    [self.pdfView goToPage:currentPage];
  } else {
    [self applyCurrentPage];
  }
}

- (void)setCurrentPage:(NSInteger)currentPage {
  _currentPage = MAX(1, currentPage);
  [self applyCurrentPage];
}

- (void)setZoom:(CGFloat)zoom {
  if (!isfinite(zoom)) return;
  CGFloat normalized = [self clampedZoom:zoom];
  CGFloat currentNativeZoom = [self normalizedZoomForPdfView];
  _zoom = normalized;
  if (currentNativeZoom > 0 && fabs(currentNativeZoom - normalized) <= 0.015) {
    self.lastEmittedZoom = normalized;
    return;
  }
  [self applyNormalizedZoom];
  self.lastEmittedZoom = normalized;
}

- (void)handleStoredDocumentChanged:(NSNotification *)notification {
  NSString *changedEngineId = [notification.userInfo[PapyrusEngineStoreEngineIdKey] copy];
  if (changedEngineId.length == 0) return;

  __weak typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    typeof(self) strongSelf = weakSelf;
    if (!strongSelf || ![changedEngineId isEqualToString:strongSelf.engineId]) return;
    [strongSelf reloadDocumentFromStore];
  });
}

- (void)reloadDocumentFromStore {
  NSAssert(NSThread.isMainThread, @"PDFView must only be updated on the main thread");
  PDFDocument *document = self.engineId.length > 0
      ? [[PapyrusEngineStore shared] documentForEngine:self.engineId]
      : nil;
  if (self.pdfView.document == document) {
    [self applyCurrentPage];
    return;
  }

  self.lastVisiblePagesSignature = nil;
  self.lastEmittedPage = NSNotFound;
  self.pdfView.document = document;
  if (!document) {
    self.lastEmittedZoom = NAN;
    return;
  }

  [self configureDisplayMode];
  self.pdfView.autoScales = YES;
  [self.pdfView layoutDocumentView];
  [self updateScaleLimitsForFitScale:self.pdfView.scaleFactorForSizeToFit];
  self.pdfView.autoScales = NO;
  [self applyNormalizedZoom];
  [self applyCurrentPage];
  [self refreshScrollViewObservation];
  [self emitVisiblePagesIfNeeded];
}

- (void)configureDisplayMode {
  self.pdfView.displayBox = kPDFDisplayBoxCropBox;
  self.pdfView.displayDirection = kPDFDisplayDirectionVertical;
  self.pdfView.displaysPageBreaks = YES;
  self.pdfView.displayMode = [self.viewMode isEqualToString:@"single"]
      ? kPDFDisplaySinglePage
      : kPDFDisplaySinglePageContinuous;
}

- (void)updateFitScalePreservingViewport {
  if (!self.pdfView.document || CGRectGetWidth(self.bounds) <= 0 || CGRectGetHeight(self.bounds) <= 0) return;

  PDFPage *currentPage = self.pdfView.currentPage;
  self.pdfView.autoScales = YES;
  [self.pdfView layoutDocumentView];
  [self updateScaleLimitsForFitScale:self.pdfView.scaleFactorForSizeToFit];
  self.pdfView.autoScales = NO;
  [self applyNormalizedZoom];

  if (currentPage) {
    [self.pdfView goToPage:currentPage];
  } else {
    [self applyCurrentPage];
  }
}

- (void)updateScaleLimitsForFitScale:(CGFloat)fitScale {
  if (!isfinite(fitScale) || fitScale <= 0) return;
  self.pdfView.minScaleFactor = fitScale * PapyrusPdfMinimumZoom;
  self.pdfView.maxScaleFactor = fitScale * PapyrusPdfMaximumZoom;
}

- (void)applyNormalizedZoom {
  CGFloat fitScale = self.pdfView.scaleFactorForSizeToFit;
  if (!isfinite(fitScale) || fitScale <= 0) return;
  [self updateScaleLimitsForFitScale:fitScale];

  CGFloat targetScale = fitScale * [self clampedZoom:self.zoom];
  targetScale = MAX(self.pdfView.minScaleFactor,
                    MIN(self.pdfView.maxScaleFactor, targetScale));
  if (fabs(self.pdfView.scaleFactor - targetScale) > 0.001) {
    self.pdfView.scaleFactor = targetScale;
  }
}

- (CGFloat)normalizedZoomForPdfView {
  CGFloat fitScale = self.pdfView.scaleFactorForSizeToFit;
  if (!isfinite(fitScale) || fitScale <= 0) return 0;
  CGFloat normalized = self.pdfView.scaleFactor / fitScale;
  return isfinite(normalized) ? [self clampedZoom:normalized] : 0;
}

- (CGFloat)clampedZoom:(CGFloat)zoom {
  return MAX(PapyrusPdfMinimumZoom, MIN(PapyrusPdfMaximumZoom, zoom));
}

- (void)applyCurrentPage {
  PDFDocument *document = self.pdfView.document;
  if (!document || document.pageCount <= 0 || self.currentPage <= 0) return;
  NSInteger targetPage = MAX(1, MIN(self.currentPage, document.pageCount));
  _currentPage = targetPage;
  PDFPage *page = [document pageAtIndex:targetPage - 1];
  if (page && self.pdfView.currentPage != page) {
    [self.pdfView goToPage:page];
  }
}

- (void)handlePdfPageChanged:(NSNotification *)notification {
  if (notification.object != self.pdfView) return;
  [self emitCurrentPageIfNeeded];
  [self emitVisiblePagesIfNeeded];
}

- (void)emitCurrentPageIfNeeded {
  PDFDocument *document = self.pdfView.document;
  PDFPage *page = self.pdfView.currentPage;
  if (!document || !page) return;
  NSInteger pageNumber = [document indexForPage:page] + 1;
  if (pageNumber <= 0 || pageNumber == self.lastEmittedPage) return;

  _currentPage = pageNumber;
  self.lastEmittedPage = pageNumber;
  if (self.onPageChange) {
    self.onPageChange(@{@"page" : @(pageNumber)});
  }
}

- (void)handlePdfScaleChanged:(NSNotification *)notification {
  if (notification.object != self.pdfView) return;
  CGFloat normalized = [self normalizedZoomForPdfView];
  if (normalized <= 0) return;
  _zoom = normalized;
  if (self.zoomEventScheduled) return;

  self.zoomEventScheduled = YES;
  __weak typeof(self) weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW,
                               (int64_t)(PapyrusPdfZoomEventInterval * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    typeof(self) strongSelf = weakSelf;
    if (!strongSelf) return;
    strongSelf.zoomEventScheduled = NO;
    [strongSelf emitZoomIfNeeded];
  });
}

- (void)emitZoomIfNeeded {
  CGFloat normalized = [self normalizedZoomForPdfView];
  if (normalized <= 0) return;
  if (isfinite(self.lastEmittedZoom) &&
      fabs(normalized - self.lastEmittedZoom) <= PapyrusPdfZoomEventTolerance) {
    return;
  }

  _zoom = normalized;
  self.lastEmittedZoom = normalized;
  if (self.onZoomChange) {
    self.onZoomChange(@{@"zoom" : @(normalized)});
  }
}

- (void)handlePdfVisiblePagesChanged:(NSNotification *)notification {
  if (notification.object != self.pdfView) return;
  [self emitVisiblePagesIfNeeded];
}

- (void)emitVisiblePagesIfNeeded {
  PDFDocument *document = self.pdfView.document;
  if (!document || self.pdfView.bounds.size.width <= 0 || self.pdfView.bounds.size.height <= 0) return;

  NSMutableArray<NSDictionary *> *pages = [NSMutableArray array];
  NSMutableArray<NSString *> *signatureParts = [NSMutableArray array];
  for (PDFPage *page in self.pdfView.visiblePages) {
    NSInteger pageIndex = [document indexForPage:page];
    if (pageIndex == NSNotFound) continue;
    CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
    CGRect viewBounds = [self.pdfView convertRect:pageBounds fromPage:page];
    CGRect intersection = CGRectIntersection(self.pdfView.bounds, viewBounds);
    CGFloat pageArea = CGRectGetWidth(viewBounds) * CGRectGetHeight(viewBounds);
    CGFloat visibleArea = CGRectIsNull(intersection)
        ? 0
        : CGRectGetWidth(intersection) * CGRectGetHeight(intersection);
    if (!isfinite(pageArea) || pageArea <= 0 || visibleArea <= 0) continue;

    CGFloat visibleRatio = MIN(1.0, MAX(0.0, visibleArea / pageArea));
    if (visibleRatio <= 0) continue;
    [pages addObject:@{@"pageIndex" : @(pageIndex), @"visibleRatio" : @(visibleRatio)}];
    NSInteger bucket = (NSInteger)llround(visibleRatio * 20.0);
    [signatureParts addObject:[NSString stringWithFormat:@"%ld:%ld", (long)pageIndex, (long)bucket]];
  }

  if (pages.count == 0) return;
  NSString *signature = [signatureParts componentsJoinedByString:@"|"];
  if ([signature isEqualToString:self.lastVisiblePagesSignature]) return;
  self.lastVisiblePagesSignature = signature;
  if (self.onVisiblePagesChange) {
    self.onVisiblePagesChange(@{@"pages" : pages});
  }
}

- (UIScrollView *)findScrollViewInView:(UIView *)view {
  for (UIView *subview in view.subviews) {
    if ([subview isKindOfClass:[UIScrollView class]]) {
      return (UIScrollView *)subview;
    }
    UIScrollView *nested = [self findScrollViewInView:subview];
    if (nested) return nested;
  }
  return nil;
}

- (void)refreshScrollViewObservation {
  UIScrollView *scrollView = [self findScrollViewInView:self.pdfView];
  if (scrollView == self.observedScrollView) return;
  [self stopObservingScrollView];
  self.observedScrollView = scrollView;
  if (!scrollView) return;

  @try {
    [scrollView addObserver:self
                 forKeyPath:@"contentOffset"
                    options:NSKeyValueObservingOptionNew
                    context:PapyrusPdfScrollObservationContext];
  } @catch (__unused NSException *exception) {
    self.observedScrollView = nil;
  }
}

- (void)stopObservingScrollView {
  UIScrollView *scrollView = self.observedScrollView;
  if (!scrollView) return;
  @try {
    [scrollView removeObserver:self
                    forKeyPath:@"contentOffset"
                       context:PapyrusPdfScrollObservationContext];
  } @catch (__unused NSException *exception) {
  }
  self.observedScrollView = nil;
}

- (void)observeValueForKeyPath:(NSString *)keyPath
                      ofObject:(id)object
                        change:(NSDictionary<NSKeyValueChangeKey, id> *)change
                       context:(void *)context {
  if (context != PapyrusPdfScrollObservationContext) {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
    return;
  }
  if (![keyPath isEqualToString:@"contentOffset"]) return;
  if (!NSThread.isMainThread) {
    __weak typeof(self) weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{
      typeof(self) strongSelf = weakSelf;
      if (strongSelf && object == strongSelf.observedScrollView) {
        UIScrollView *scrollView = strongSelf.observedScrollView;
        [strongSelf scheduleScrollEventWithOffsetY:scrollView.contentOffset.y];
      }
    });
    return;
  }
  if (object != self.observedScrollView) return;
  UIScrollView *scrollView = self.observedScrollView;
  CGFloat offsetY = scrollView.contentOffset.y;
  [self scheduleScrollEventWithOffsetY:offsetY];
}

- (void)scheduleScrollEventWithOffsetY:(CGFloat)offsetY {
  self.pendingScrollOffsetY = offsetY;
  CFTimeInterval now = CACurrentMediaTime();
  CFTimeInterval elapsed = now - self.lastScrollEventTime;
  if (elapsed >= PapyrusPdfScrollEventInterval && !self.scrollEventScheduled) {
    [self emitScrollEvent];
    return;
  }
  if (self.scrollEventScheduled) return;

  self.scrollEventScheduled = YES;
  CFTimeInterval delay = MAX(0, PapyrusPdfScrollEventInterval - elapsed);
  __weak typeof(self) weakSelf = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(delay * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    typeof(self) strongSelf = weakSelf;
    if (!strongSelf) return;
    strongSelf.scrollEventScheduled = NO;
    [strongSelf emitScrollEvent];
  });
}

- (void)emitScrollEvent {
  self.lastScrollEventTime = CACurrentMediaTime();
  if (self.onScroll) {
    self.onScroll(@{@"offsetY" : @(self.pendingScrollOffsetY)});
  }
}

- (void)handleDocumentTap:(UITapGestureRecognizer *)recognizer {
  if (recognizer.state != UIGestureRecognizerStateEnded) return;
  PDFDocument *document = self.pdfView.document;
  if (!document) return;

  CGPoint viewPoint = [recognizer locationInView:self.pdfView];
  PDFPage *page = [self.pdfView pageForPoint:viewPoint nearest:YES];
  if (!page) return;
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectGetWidth(pageBounds) <= 0 || CGRectGetHeight(pageBounds) <= 0) return;
  CGPoint pagePoint = [self.pdfView convertPoint:viewPoint toPage:page];
  CGFloat x = (pagePoint.x - CGRectGetMinX(pageBounds)) / CGRectGetWidth(pageBounds);
  CGFloat y = 1.0 - ((pagePoint.y - CGRectGetMinY(pageBounds)) / CGRectGetHeight(pageBounds));
  NSInteger pageIndex = [document indexForPage:page];
  if (pageIndex == NSNotFound) return;

  if (self.onTap) {
    self.onTap(@{
      @"pageIndex" : @(pageIndex),
      @"x" : @(MIN(1.0, MAX(0.0, x))),
      @"y" : @(MIN(1.0, MAX(0.0, y)))
    });
  }
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer
    shouldRecognizeSimultaneouslyWithGestureRecognizer:(UIGestureRecognizer *)otherGestureRecognizer {
  return YES;
}

@end
