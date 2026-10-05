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

static NSDictionary *PapyrusNormalizedSelectionRect(CGRect rect, CGRect pageBounds) {
  if (CGRectIsNull(rect) || CGRectIsEmpty(rect)) return nil;
  rect = CGRectIntersection(rect, pageBounds);
  if (CGRectIsNull(rect) || CGRectIsEmpty(rect)) return nil;

  CGFloat pageWidth = CGRectGetWidth(pageBounds);
  CGFloat pageHeight = CGRectGetHeight(pageBounds);
  if (!isfinite(pageWidth) || !isfinite(pageHeight) || pageWidth <= 0 || pageHeight <= 0) {
    return nil;
  }

  CGFloat x = (CGRectGetMinX(rect) - CGRectGetMinX(pageBounds)) / pageWidth;
  CGFloat y = 1.0 - ((CGRectGetMaxY(rect) - CGRectGetMinY(pageBounds)) / pageHeight);
  CGFloat width = CGRectGetWidth(rect) / pageWidth;
  CGFloat height = CGRectGetHeight(rect) / pageHeight;
  if (!isfinite(x) || !isfinite(y) || !isfinite(width) || !isfinite(height)) return nil;

  x = MIN(1.0, MAX(0.0, x));
  y = MIN(1.0, MAX(0.0, y));
  width = MIN(1.0 - x, MAX(0.0, width));
  height = MIN(1.0 - y, MAX(0.0, height));
  if (width <= 0 || height <= 0) return nil;

  return @{@"x" : @(x), @"y" : @(y), @"width" : @(width), @"height" : @(height)};
}

@interface PapyrusPdfDocumentView () <UIEditMenuInteractionDelegate>
@property (nonatomic, strong) PDFView *pdfView;
@property (nonatomic, strong) UIEditMenuInteraction *editMenuInteraction;
@property (nonatomic, copy) NSArray<PDFSelection *> *searchSelections;
@property (nonatomic, copy) NSDictionary<NSNumber *, PDFSelection *> *searchSelectionsByResultIndex;
@property (nonatomic, assign) NSUInteger searchNavigationGeneration;
@property (nonatomic, weak) UIScrollView *observedScrollView;
@property (nonatomic, strong) UITapGestureRecognizer *tapRecognizer;
@property (nonatomic, strong) UITapGestureRecognizer *doubleTapRecognizer;
@property (nonatomic, assign) CGSize lastLayoutSize;
@property (nonatomic, assign) NSInteger lastEmittedPage;
@property (nonatomic, assign) CGFloat lastEmittedZoom;
@property (nonatomic, copy) NSString *lastVisiblePagesSignature;
@property (nonatomic, assign) BOOL zoomEventScheduled;
@property (nonatomic, assign) BOOL suppressScaleSynchronization;
@property (nonatomic, assign) BOOL scrollEventScheduled;
@property (nonatomic, assign) CGFloat pendingScrollOffsetY;
@property (nonatomic, assign) CFTimeInterval lastScrollEventTime;
@property (nonatomic, copy) NSString *lastSelectionSignature;
@property (nonatomic, assign) NSInteger lastSelectionPageIndex;
@property (nonatomic, assign) BOOL lastSelectionWasActive;
@property (nonatomic, assign) NSUInteger selectionMenuGeneration;
- (void)scheduleSelectionEditMenuForSignature:(NSString *)signature;
- (void)attemptSelectionEditMenuForSignature:(NSString *)signature generation:(NSUInteger)generation;
- (BOOL)hasActiveGestureInView:(UIView *)view;
- (void)emitDefineSelection;
- (void)rebuildSearchHighlights;
- (void)updateSearchHighlightColorsFromResultIndex:(NSInteger)previousSearchIndex;
- (void)scheduleNavigationToSearchResultAtIndex:(NSInteger)activeSearchIndex;
- (UIColor *)searchHighlightColorForActive:(BOOL)isActive;
@end

@implementation PapyrusPdfDocumentView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (!self) return nil;

  _pageTheme = @"normal";
  _viewMode = @"continuous";
  _zoom = 1.0;
  _currentPage = 1;
  _searchResults = @[];
  _activeSearchIndex = -1;
  _searchSelections = @[];
  _searchSelectionsByResultIndex = @{};
  _searchNavigationGeneration = 0;
  _lastEmittedPage = NSNotFound;
  _lastSelectionPageIndex = NSNotFound;
  _lastEmittedZoom = NAN;
  _lastLayoutSize = CGSizeZero;
  _defineLabel = NSLocalizedString(@"Define", nil);
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

  if (@available(iOS 16.0, *)) {
    _editMenuInteraction = [[UIEditMenuInteraction alloc] initWithDelegate:self];
    [_pdfView addInteraction:_editMenuInteraction];
  }

  _tapRecognizer = [[UITapGestureRecognizer alloc]
      initWithTarget:self
              action:@selector(handleDocumentTap:)];
  _tapRecognizer.delegate = self;
  _tapRecognizer.cancelsTouchesInView = NO;
  _tapRecognizer.delaysTouchesBegan = NO;
  [_pdfView addGestureRecognizer:_tapRecognizer];

  _doubleTapRecognizer = [[UITapGestureRecognizer alloc]
      initWithTarget:self
              action:@selector(handleDocumentDoubleTap:)];
  _doubleTapRecognizer.numberOfTapsRequired = 2;
  _doubleTapRecognizer.delegate = self;
  _doubleTapRecognizer.cancelsTouchesInView = NO;
  _doubleTapRecognizer.delaysTouchesBegan = NO;
  [_pdfView addGestureRecognizer:_doubleTapRecognizer];
  [_tapRecognizer requireGestureRecognizerToFail:_doubleTapRecognizer];

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
             selector:@selector(handlePdfSelectionChanged:)
                 name:PDFViewSelectionChangedNotification
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
  self.doubleTapRecognizer.delegate = nil;
}

- (void)setSelectionActive:(BOOL)selectionActive {
  _selectionActive = selectionActive;
  if (!selectionActive) {
    [self clearCurrentSelection];
  }
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
  CGFloat desiredZoom = [self clampedZoom:self.zoom];
  BOOL wasSuppressingScaleSynchronization = self.suppressScaleSynchronization;
  self.suppressScaleSynchronization = YES;
  PDFPage *currentPage = self.pdfView.currentPage;
  _viewMode = normalized;
  self.pdfView.displayMode = [normalized isEqualToString:@"single"]
      ? kPDFDisplaySinglePage
      : kPDFDisplaySinglePageContinuous;
  _zoom = desiredZoom;
  [self updateFitScalePreservingViewport];
  if (currentPage) {
    [self.pdfView goToPage:currentPage];
  } else {
    [self applyCurrentPage];
  }
  _zoom = desiredZoom;
  [self applyNormalizedZoom];
  self.suppressScaleSynchronization = wasSuppressingScaleSynchronization;
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
    [self rebuildSearchHighlights];
    return;
  }

  CGFloat desiredZoom = [self clampedZoom:self.zoom];
  BOOL wasSuppressingScaleSynchronization = self.suppressScaleSynchronization;
  self.suppressScaleSynchronization = YES;
  self.lastVisiblePagesSignature = nil;
  self.lastEmittedPage = NSNotFound;
  [self clearCurrentSelection];
  self.pdfView.document = document;
  if (!document) {
    [self rebuildSearchHighlights];
    self.lastEmittedZoom = NAN;
    _zoom = desiredZoom;
    self.suppressScaleSynchronization = wasSuppressingScaleSynchronization;
    return;
  }

  [self configureDisplayMode];
  self.pdfView.autoScales = YES;
  [self.pdfView layoutDocumentView];
  [self updateScaleLimitsForFitScale:self.pdfView.scaleFactorForSizeToFit];
  self.pdfView.autoScales = NO;
  _zoom = desiredZoom;
  [self applyNormalizedZoom];
  [self applyCurrentPage];
  _zoom = desiredZoom;
  [self applyNormalizedZoom];
  [self refreshScrollViewObservation];
  [self emitVisiblePagesIfNeeded];
  [self rebuildSearchHighlights];
  self.suppressScaleSynchronization = wasSuppressingScaleSynchronization;
}

- (void)setSearchResults:(NSArray<NSDictionary *> *)searchResults {
  _searchResults = [searchResults copy] ?: @[];
  [self rebuildSearchHighlights];
}

- (void)setActiveSearchIndex:(NSInteger)activeSearchIndex {
  NSInteger previousSearchIndex = _activeSearchIndex;
  _activeSearchIndex = activeSearchIndex;
  [self updateSearchHighlightColorsFromResultIndex:previousSearchIndex];
  [self scheduleNavigationToSearchResultAtIndex:activeSearchIndex];
}

- (UIColor *)searchHighlightColorForActive:(BOOL)isActive {
  return isActive
      ? [UIColor colorWithRed:1.0 green:0.66 blue:0.08 alpha:0.54]
      : [UIColor colorWithRed:1.0 green:0.82 blue:0.20 alpha:0.25];
}

- (void)rebuildSearchHighlights {
  PDFDocument *document = self.pdfView.document;
  if (!document || self.searchResults.count == 0) {
    self.searchSelections = @[];
    self.searchSelectionsByResultIndex = @{};
    self.pdfView.highlightedSelections = nil;
    [self scheduleNavigationToSearchResultAtIndex:self.activeSearchIndex];
    return;
  }

  NSMutableArray<PDFSelection *> *selections =
      [NSMutableArray arrayWithCapacity:self.searchResults.count];
  NSMutableDictionary<NSNumber *, PDFSelection *> *selectionsByResultIndex =
      [NSMutableDictionary dictionaryWithCapacity:self.searchResults.count];
  for (NSUInteger resultIndex = 0; resultIndex < self.searchResults.count; resultIndex += 1) {
    id resultValue = self.searchResults[resultIndex];
    if (![resultValue isKindOfClass:NSDictionary.class]) continue;
    NSDictionary *result = (NSDictionary *)resultValue;
    id pageIndexValue = result[@"pageIndex"];
    if (![pageIndexValue isKindOfClass:NSNumber.class]) continue;
    double pageIndexNumber = [pageIndexValue doubleValue];
    if (!isfinite(pageIndexNumber) || floor(pageIndexNumber) != pageIndexNumber ||
        pageIndexNumber < 0 || pageIndexNumber >= (double)document.pageCount) {
      continue;
    }
    NSUInteger pageIndex = (NSUInteger)pageIndexNumber;

    PDFPage *page = [document pageAtIndex:pageIndex];
    id rectsValue = result[@"rects"];
    NSArray *rects = [rectsValue isKindOfClass:NSArray.class] ? rectsValue : @[];
    if (!page || rects.count == 0) continue;

    CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
    if (pageBounds.size.width <= 0 || pageBounds.size.height <= 0) continue;

    PDFSelection *match = [[PDFSelection alloc] initWithDocument:document];
    BOOL hasSelectedText = NO;
    for (id rectValue in rects) {
      if (![rectValue isKindOfClass:NSDictionary.class]) continue;
      NSDictionary *rect = (NSDictionary *)rectValue;
      id xValue = rect[@"x"];
      id yValue = rect[@"y"];
      id widthValue = rect[@"width"];
      id heightValue = rect[@"height"];
      if (![xValue respondsToSelector:@selector(doubleValue)] ||
          ![yValue respondsToSelector:@selector(doubleValue)] ||
          ![widthValue respondsToSelector:@selector(doubleValue)] ||
          ![heightValue respondsToSelector:@selector(doubleValue)]) {
        continue;
      }

      CGFloat x = [xValue doubleValue];
      CGFloat y = [yValue doubleValue];
      CGFloat width = [widthValue doubleValue];
      CGFloat height = [heightValue doubleValue];
      if (!isfinite(x) || !isfinite(y) || !isfinite(width) || !isfinite(height) ||
          width <= 0 || height <= 0) {
        continue;
      }

      CGFloat normalizedX = MIN(1.0, MAX(0.0, x));
      CGFloat normalizedY = MIN(1.0, MAX(0.0, y));
      CGFloat normalizedRight = MIN(1.0, MAX(normalizedX, x + width));
      CGFloat normalizedBottom = MIN(1.0, MAX(normalizedY, y + height));
      CGFloat normalizedWidth = normalizedRight - normalizedX;
      CGFloat normalizedHeight = normalizedBottom - normalizedY;
      if (normalizedWidth <= 0 || normalizedHeight <= 0) continue;

      CGRect pageRect = CGRectMake(
          pageBounds.origin.x + normalizedX * pageBounds.size.width,
          pageBounds.origin.y +
              (1.0 - normalizedY - normalizedHeight) * pageBounds.size.height,
          normalizedWidth * pageBounds.size.width,
          normalizedHeight * pageBounds.size.height);
      PDFSelection *lineSelection = [page selectionForRect:pageRect];
      if (!lineSelection.string.length) continue;

      [match addSelection:lineSelection];
      hasSelectedText = YES;
    }

    if (!hasSelectedText) continue;
    match.color = [self searchHighlightColorForActive:
        ((NSInteger)resultIndex == self.activeSearchIndex)];
    [selections addObject:match];
    selectionsByResultIndex[@(resultIndex)] = match;
  }

  self.searchSelections = [selections copy];
  self.searchSelectionsByResultIndex = [selectionsByResultIndex copy];
  self.pdfView.highlightedSelections =
      self.searchSelections.count > 0 ? self.searchSelections : nil;
  [self scheduleNavigationToSearchResultAtIndex:self.activeSearchIndex];
}

- (void)updateSearchHighlightColorsFromResultIndex:(NSInteger)previousSearchIndex {
  if (previousSearchIndex == self.activeSearchIndex) return;

  PDFSelection *previousSelection =
      self.searchSelectionsByResultIndex[@(previousSearchIndex)];
  PDFSelection *activeSelection =
      self.searchSelectionsByResultIndex[@(self.activeSearchIndex)];
  if (previousSelection) {
    previousSelection.color = [self searchHighlightColorForActive:NO];
  }
  if (activeSelection) {
    activeSelection.color = [self searchHighlightColorForActive:YES];
  }
  if (previousSelection || activeSelection) {
    self.pdfView.highlightedSelections = self.searchSelections;
  }
}

- (void)scheduleNavigationToSearchResultAtIndex:(NSInteger)activeSearchIndex {
  NSUInteger generation = ++self.searchNavigationGeneration;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.searchNavigationGeneration != generation ||
        self.activeSearchIndex != activeSearchIndex) {
      return;
    }
    PDFSelection *selection =
        self.searchSelectionsByResultIndex[@(activeSearchIndex)];
    if (!selection) return;
    [self.pdfView goToSelection:selection];
  });
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

  CGFloat desiredZoom = [self clampedZoom:self.zoom];
  BOOL wasSuppressingScaleSynchronization = self.suppressScaleSynchronization;
  self.suppressScaleSynchronization = YES;
  PDFPage *currentPage = self.pdfView.currentPage;
  self.pdfView.autoScales = YES;
  [self.pdfView layoutDocumentView];
  [self updateScaleLimitsForFitScale:self.pdfView.scaleFactorForSizeToFit];
  self.pdfView.autoScales = NO;
  _zoom = desiredZoom;
  [self applyNormalizedZoom];

  if (currentPage) {
    [self.pdfView goToPage:currentPage];
  } else {
    [self applyCurrentPage];
  }
  _zoom = desiredZoom;
  [self applyNormalizedZoom];
  self.suppressScaleSynchronization = wasSuppressingScaleSynchronization;
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
  if (self.suppressScaleSynchronization) return;
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

- (void)handlePdfSelectionChanged:(NSNotification *)notification {
  if (notification.object != self.pdfView) return;
  [self emitCurrentSelectionIfNeeded];
}

- (void)emitCurrentSelectionIfNeeded {
  PDFSelection *selection = self.pdfView.currentSelection;
  NSString *text = selection.string ?: @"";
  PDFDocument *document = self.pdfView.document;
  PDFPage *page = selection.pages.firstObject;
  NSInteger pageIndex = document && page ? [document indexForPage:page] : NSNotFound;
  if (!document || !page || pageIndex == NSNotFound || text.length == 0 ||
      [text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].length == 0) {
    [self emitSelectionClearedIfNeeded];
    return;
  }

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsEmpty(pageBounds)) {
    [self emitSelectionClearedIfNeeded];
    return;
  }

  NSMutableArray<NSDictionary *> *rects = [NSMutableArray array];
  for (PDFSelection *line in selection.selectionsByLine) {
    NSDictionary *normalizedRect = PapyrusNormalizedSelectionRect(
        [line boundsForPage:page], pageBounds);
    if (normalizedRect) [rects addObject:normalizedRect];
  }

  if (rects.count == 0) {
    NSDictionary *normalizedRect = PapyrusNormalizedSelectionRect(
        [selection boundsForPage:page], pageBounds);
    if (normalizedRect) [rects addObject:normalizedRect];
  }

  NSString *signature = [NSString stringWithFormat:@"%ld|%@|%@", (long)pageIndex, text, rects];
  if (self.lastSelectionWasActive && [signature isEqualToString:self.lastSelectionSignature]) return;
  self.lastSelectionWasActive = YES;
  self.lastSelectionPageIndex = pageIndex;
  self.lastSelectionSignature = signature;
  if (self.onTextSelected) {
    self.onTextSelected(@{@"text" : text, @"pageIndex" : @(pageIndex), @"rects" : rects});
  }
  [self scheduleSelectionEditMenuForSignature:signature];
}

- (void)emitSelectionClearedIfNeeded {
  if (!self.lastSelectionWasActive) return;
  self.selectionMenuGeneration += 1;
  if (@available(iOS 16.0, *)) {
    [self.editMenuInteraction dismissMenu];
  }
  NSInteger pageIndex = self.lastSelectionPageIndex;
  if (pageIndex == NSNotFound) pageIndex = MAX(0, self.currentPage - 1);
  self.lastSelectionWasActive = NO;
  self.lastSelectionSignature = nil;
  self.lastSelectionPageIndex = NSNotFound;
  if (self.onTextSelected) {
    self.onTextSelected(@{@"text" : @"", @"pageIndex" : @(pageIndex), @"rects" : @[]});
  }
}

- (void)scheduleSelectionEditMenuForSignature:(NSString *)signature {
  if (@available(iOS 16.0, *)) {
    UIEditMenuInteraction *interaction = self.editMenuInteraction;
    if (!interaction || signature.length == 0) return;

    NSUInteger generation = ++self.selectionMenuGeneration;
    __weak typeof(self) weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.22 * NSEC_PER_SEC)),
                   dispatch_get_main_queue(), ^{
      typeof(self) strongSelf = weakSelf;
      [strongSelf attemptSelectionEditMenuForSignature:signature generation:generation];
    });
  }
}

- (void)attemptSelectionEditMenuForSignature:(NSString *)signature generation:(NSUInteger)generation {
  if (@available(iOS 16.0, *)) {
    if (generation != self.selectionMenuGeneration ||
        ![signature isEqualToString:self.lastSelectionSignature]) {
      return;
    }

    if ([self hasActiveGestureInView:self.pdfView]) {
      __weak typeof(self) weakSelf = self;
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.10 * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        typeof(self) strongSelf = weakSelf;
        [strongSelf attemptSelectionEditMenuForSignature:signature generation:generation];
      });
      return;
    }

    UIEditMenuInteraction *interaction = self.editMenuInteraction;
    PDFSelection *selection = self.pdfView.currentSelection;
    PDFPage *page = selection.pages.firstObject;
    if (!interaction || !selection.string.length || !page || !self.onDefineSelection) return;

    CGRect selectionRect = [selection boundsForPage:page];
    CGRect viewRect = [self.pdfView convertRect:selectionRect fromPage:page];
    if (CGRectIsNull(viewRect) || CGRectIsEmpty(viewRect)) return;
    CGPoint sourcePoint = CGPointMake(CGRectGetMidX(viewRect), CGRectGetMidY(viewRect));
    UIEditMenuConfiguration *configuration =
        [[UIEditMenuConfiguration alloc] initWithIdentifier:signature sourcePoint:sourcePoint];
    [interaction presentEditMenuWithConfiguration:configuration];
  }
}

- (BOOL)hasActiveGestureInView:(UIView *)view {
  for (UIGestureRecognizer *recognizer in view.gestureRecognizers) {
    if (recognizer.state == UIGestureRecognizerStateBegan ||
        recognizer.state == UIGestureRecognizerStateChanged) {
      return YES;
    }
  }

  for (UIView *subview in view.subviews) {
    if ([self hasActiveGestureInView:subview]) return YES;
  }
  return NO;
}

- (nullable UIMenu *)editMenuInteraction:(UIEditMenuInteraction *)interaction
    menuForConfiguration:(UIEditMenuConfiguration *)configuration
          suggestedActions:(NSArray<UIMenuElement *> *)suggestedActions API_AVAILABLE(ios(16.0)) {
  NSMutableArray<UIMenuElement *> *actions = [suggestedActions mutableCopy];
  if (!actions) actions = [NSMutableArray array];

  if (self.onDefineSelection && self.defineLabel.length > 0 &&
      self.pdfView.currentSelection.string.length > 0) {
    __weak typeof(self) weakSelf = self;
    UIAction *defineAction = [UIAction
        actionWithTitle:self.defineLabel
                  image:[UIImage systemImageNamed:@"text.magnifyingglass"]
             identifier:@"com.papyrus.define-selection"
                handler:^(__kindof UIAction *action) {
      [weakSelf emitDefineSelection];
    }];
    [actions addObject:defineAction];
  }

  return [UIMenu menuWithChildren:actions];
}

- (CGRect)editMenuInteraction:(UIEditMenuInteraction *)interaction
    targetRectForConfiguration:(UIEditMenuConfiguration *)configuration API_AVAILABLE(ios(16.0)) {
  PDFSelection *selection = self.pdfView.currentSelection;
  PDFPage *page = selection.pages.firstObject;
  if (!selection || !page) return CGRectZero;

  CGRect selectionRect = [selection boundsForPage:page];
  CGRect viewRect = [self.pdfView convertRect:selectionRect fromPage:page];
  return CGRectIsNull(viewRect) || CGRectIsEmpty(viewRect) ? CGRectZero : viewRect;
}

- (void)emitDefineSelection {
  if (!self.onDefineSelection) return;
  PDFSelection *selection = self.pdfView.currentSelection;
  NSString *text = selection.string ?: @"";
  PDFDocument *document = self.pdfView.document;
  PDFPage *page = selection.pages.firstObject;
  NSInteger pageIndex = document && page ? [document indexForPage:page] : NSNotFound;
  if (text.length == 0 || !document || !page || pageIndex == NSNotFound) return;

  self.onDefineSelection(@{@"text" : text, @"pageIndex" : @(pageIndex)});
}

- (void)clearCurrentSelection {
  if (self.pdfView.currentSelection) {
    self.pdfView.currentSelection = nil;
  }
  [self emitSelectionClearedIfNeeded];
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
  if (self.pdfView.currentSelection && ![self selectionContainsViewPoint:viewPoint]) {
    [self clearCurrentSelection];
    return;
  }
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

- (void)handleDocumentDoubleTap:(UITapGestureRecognizer *)recognizer {
  if (recognizer.state != UIGestureRecognizerStateEnded) return;
  PDFDocument *document = self.pdfView.document;
  if (!document) return;

  CGPoint viewPoint = [recognizer locationInView:self.pdfView];
  PDFPage *page = [self.pdfView pageForPoint:viewPoint nearest:YES];
  if (!page) return;
  CGPoint pagePoint = [self.pdfView convertPoint:viewPoint toPage:page];
  PDFSelection *selection = [page selectionForWordAtPoint:pagePoint];
  self.pdfView.currentSelection = selection;
  [self emitCurrentSelectionIfNeeded];
}

- (BOOL)selectionContainsViewPoint:(CGPoint)viewPoint {
  PDFSelection *selection = self.pdfView.currentSelection;
  if (!selection) return NO;

  NSArray<PDFSelection *> *lines = selection.selectionsByLine;
  if (lines.count == 0) lines = @[selection];
  for (PDFPage *page in selection.pages) {
    for (PDFSelection *line in lines) {
      CGRect pageRect = [line boundsForPage:page];
      if (CGRectIsNull(pageRect) || CGRectIsEmpty(pageRect)) continue;
      CGRect viewRect = [self.pdfView convertRect:pageRect fromPage:page];
      if (CGRectContainsPoint(CGRectInset(viewRect, -6, -6), viewPoint)) return YES;
    }
  }
  return NO;
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer
    shouldRecognizeSimultaneouslyWithGestureRecognizer:(UIGestureRecognizer *)otherGestureRecognizer {
  return YES;
}

@end
