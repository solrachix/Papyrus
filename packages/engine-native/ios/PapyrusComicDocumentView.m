#import "PapyrusComicDocumentView.h"
#import "PapyrusComicZoomGeometry.h"
#import "../vendor/libarchive/PapyrusComicArchive.h"
#import <ImageIO/ImageIO.h>
#import <math.h>
#import <os/log.h>
#import <os/signpost.h>

static NSString * const PapyrusComicCellId = @"PapyrusComicPageCell";
static os_log_t PapyrusComicZoomSignpostLog(void) {
  static os_log_t log;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    log = os_log_create("com.papyrus.sdk", "ComicZoom");
  });
  return log;
}

static NSCache<NSString *, UIImage *> *PapyrusComicImageCache(void) {
  static NSCache<NSString *, UIImage *> *cache;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    cache = [[NSCache alloc] init];
    cache.totalCostLimit = 64 * 1024 * 1024;
  });
  return cache;
}

@interface PapyrusComicPageCell : UICollectionViewCell
@property (nonatomic, strong) UIScrollView *pageScrollView;
@property (nonatomic, strong) UIImageView *imageView;
@property (nonatomic, copy) NSString *representedKey;
@property (nonatomic, assign) BOOL fitWidthInSingleMode;
@end

@implementation PapyrusComicPageCell
- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _pageScrollView = [[UIScrollView alloc] initWithFrame:self.contentView.bounds];
    _pageScrollView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _pageScrollView.alwaysBounceVertical = NO;
    _pageScrollView.showsVerticalScrollIndicator = NO;
    _pageScrollView.showsHorizontalScrollIndicator = NO;
    [self.contentView addSubview:_pageScrollView];
    _imageView = [[UIImageView alloc] initWithFrame:_pageScrollView.bounds];
    _imageView.contentMode = UIViewContentModeScaleAspectFit;
    [_pageScrollView addSubview:_imageView];
  }
  return self;
}
- (void)layoutSubviews {
  [super layoutSubviews];
  self.pageScrollView.frame = self.contentView.bounds;
  CGAffineTransform transform = self.imageView.transform;
  self.imageView.transform = CGAffineTransformIdentity;
  CGSize size = self.pageScrollView.bounds.size;
  UIImage *image = self.imageView.image;
  if (self.fitWidthInSingleMode && image.size.width > 0 && image.size.height > 0) {
    size.height = MAX(1, size.width * image.size.height / image.size.width);
  }
  self.imageView.frame = (CGRect){CGPointZero, size};
  self.pageScrollView.contentSize = size;
  BOOL canScroll = self.fitWidthInSingleMode && size.height > self.pageScrollView.bounds.size.height;
  self.pageScrollView.scrollEnabled = canScroll;
  self.pageScrollView.alwaysBounceVertical = canScroll;
  self.imageView.transform = transform;
}
- (void)prepareForReuse {
  [super prepareForReuse];
  self.pageScrollView.contentOffset = CGPointZero;
  self.pageScrollView.contentSize = self.pageScrollView.bounds.size;
  self.pageScrollView.scrollEnabled = NO;
  self.pageScrollView.alwaysBounceVertical = NO;
  self.imageView.image = nil;
  self.imageView.transform = CGAffineTransformIdentity;
  self.fitWidthInSingleMode = NO;
}
@end

@interface PapyrusComicContinuousLayout : UICollectionViewLayout
@property (nonatomic, assign) CGFloat zoomScale;
- (void)configureWithPageCount:(NSInteger)pageCount
                  viewportSize:(CGSize)viewportSize
                       fitPage:(BOOL)fitPage
                    imageSizes:(NSDictionary<NSNumber *, NSValue *> *)imageSizes;
- (void)updateImageSizes:(NSDictionary<NSNumber *, NSValue *> *)imageSizes;
@end

@interface PapyrusComicContinuousLayout ()
@property (nonatomic, assign) NSInteger pageCount;
@property (nonatomic, assign) CGSize viewportSize;
@property (nonatomic, assign) BOOL fitPage;
@property (nonatomic, copy) NSDictionary<NSNumber *, NSValue *> *imageSizes;
@property (nonatomic, strong) NSMutableData *prefixHeights;
@property (nonatomic, assign) BOOL geometryDirty;
@end

@implementation PapyrusComicContinuousLayout
- (instancetype)init {
  self = [super init];
  if (self) {
    _zoomScale = 1.0;
    _geometryDirty = YES;
    _imageSizes = @{};
  }
  return self;
}

- (void)configureWithPageCount:(NSInteger)pageCount
                  viewportSize:(CGSize)viewportSize
                       fitPage:(BOOL)fitPage
                    imageSizes:(NSDictionary<NSNumber *, NSValue *> *)imageSizes {
  NSInteger safePageCount = MAX(0, pageCount);
  NSDictionary<NSNumber *, NSValue *> *safeImageSizes = imageSizes ?: @{};
  BOOL changed = self.pageCount != safePageCount ||
    !CGSizeEqualToSize(self.viewportSize, viewportSize) ||
    self.fitPage != fitPage ||
    ![self.imageSizes isEqualToDictionary:safeImageSizes];
  if (!changed) return;
  self.pageCount = safePageCount;
  self.viewportSize = viewportSize;
  self.fitPage = fitPage;
  self.imageSizes = [safeImageSizes copy];
  self.geometryDirty = YES;
  [self invalidateLayout];
}

- (void)updateImageSizes:(NSDictionary<NSNumber *, NSValue *> *)imageSizes {
  if (imageSizes.count == 0) return;
  NSMutableDictionary<NSNumber *, NSValue *> *merged = [self.imageSizes mutableCopy] ?: [NSMutableDictionary dictionary];
  const double *prefix = (const double *)self.prefixHeights.bytes;
  NSUInteger count = (NSUInteger)MAX(0, self.pageCount);
  BOOL hasPrefix = !self.geometryDirty && self.prefixHeights.length >= sizeof(double) * (count + 1);
  NSMutableData *heightDeltasData = hasPrefix ? [NSMutableData dataWithLength:sizeof(double) * count] : nil;
  double *heightDeltas = (double *)heightDeltasData.mutableBytes;
  CGFloat width = MAX(1.0, self.viewportSize.width);
  CGFloat height = MAX(1.0, self.viewportSize.height);

  [imageSizes enumerateKeysAndObjectsUsingBlock:^(NSNumber *pageNumber, NSValue *sizeValue, BOOL *stop) {
    #pragma unused(stop)
    NSInteger page = pageNumber.integerValue;
    if (page < 0 || (NSUInteger)page >= count) return;
    NSValue *oldValue = merged[pageNumber];
    if ([oldValue isEqual:sizeValue]) return;
    CGSize size = sizeValue.CGSizeValue;
    double nextHeight = PapyrusComicContinuousPageHeight(size.width, size.height,
        width, height, self.fitPage, 1.0);
    if (hasPrefix) {
      double oldHeight = prefix[page + 1] - prefix[page];
      heightDeltas[page] = nextHeight - oldHeight;
    }
    merged[pageNumber] = sizeValue;
  }];

  self.imageSizes = [merged copy];
  if (!hasPrefix) {
    self.geometryDirty = YES;
    [self invalidateLayout];
    return;
  }

  double *mutablePrefix = (double *)self.prefixHeights.mutableBytes;
  PapyrusComicContinuousApplyHeightDeltas(mutablePrefix, heightDeltas, count);
  [self invalidateLayout];
}

- (void)setZoomScale:(CGFloat)zoomScale {
  CGFloat safeZoom = PapyrusComicClampZoom(zoomScale);
  if (fabs(safeZoom - _zoomScale) < 0.0001) return;
  _zoomScale = safeZoom;
  // Page aspect ratios and prefix heights are unchanged by zoom. Invalidating
  // asks UIKit for attributes only in its queried visible rect; it does not
  // rebuild the document geometry cache for every pinch update.
  [self invalidateLayout];
}

- (void)prepareLayout {
  [super prepareLayout];
  CGSize measuredViewport = self.collectionView.bounds.size;
  if (measuredViewport.width > 0 && !CGSizeEqualToSize(measuredViewport, self.viewportSize)) {
    self.viewportSize = measuredViewport;
    self.geometryDirty = YES;
  }
  if (!self.geometryDirty) return;

  NSUInteger count = (NSUInteger)MAX(0, self.pageCount);
  self.prefixHeights = [NSMutableData dataWithLength:sizeof(double) * (count + 1)];
  double *prefix = (double *)self.prefixHeights.mutableBytes;
  prefix[0] = 0.0;
  CGFloat width = MAX(1.0, self.viewportSize.width);
  CGFloat height = MAX(1.0, self.viewportSize.height);
  for (NSUInteger page = 0; page < count; page++) {
    CGSize imageSize = self.imageSizes[@(page)] ? self.imageSizes[@(page)].CGSizeValue : CGSizeZero;
    double pageHeight = PapyrusComicContinuousPageHeight(imageSize.width, imageSize.height,
        width, height, self.fitPage, 1.0);
    prefix[page + 1] = prefix[page] + pageHeight;
  }
  self.geometryDirty = NO;
}

- (CGSize)collectionViewContentSize {
  if (self.geometryDirty) [self prepareLayout];
  const double *prefix = (const double *)self.prefixHeights.bytes;
  NSUInteger count = (NSUInteger)MAX(0, self.pageCount);
  return CGSizeMake(PapyrusComicContinuousContentWidth(self.viewportSize.width, self.zoomScale),
                    PapyrusComicContinuousDocumentHeight(prefix, count, self.zoomScale));
}

- (UICollectionViewLayoutAttributes *)layoutAttributesForPage:(NSUInteger)page {
  if (self.geometryDirty) [self prepareLayout];
  NSUInteger count = (NSUInteger)MAX(0, self.pageCount);
  const double *prefix = (const double *)self.prefixHeights.bytes;
  PapyrusComicLayoutFrame frame = PapyrusComicContinuousPageFrame(prefix, count, page,
      self.viewportSize.width, self.zoomScale);
  if (frame.width <= 0.0 || frame.height <= 0.0) return nil;
  NSIndexPath *indexPath = [NSIndexPath indexPathForItem:(NSInteger)page inSection:0];
  UICollectionViewLayoutAttributes *attributes = [UICollectionViewLayoutAttributes layoutAttributesForCellWithIndexPath:indexPath];
  attributes.frame = CGRectMake(frame.originX, frame.originY, frame.width, frame.height);
  return attributes;
}

- (UICollectionViewLayoutAttributes *)layoutAttributesForItemAtIndexPath:(NSIndexPath *)indexPath {
  if (indexPath.section != 0 || indexPath.item < 0 || indexPath.item >= self.pageCount) return nil;
  return [self layoutAttributesForPage:(NSUInteger)indexPath.item];
}

- (NSArray<UICollectionViewLayoutAttributes *> *)layoutAttributesForElementsInRect:(CGRect)rect {
  if (self.geometryDirty) [self prepareLayout];
  NSUInteger count = (NSUInteger)MAX(0, self.pageCount);
  const double *prefix = (const double *)self.prefixHeights.bytes;
  NSUInteger page = PapyrusComicContinuousFirstVisiblePage(prefix, count,
      CGRectGetMinY(rect), self.zoomScale);
  if (page >= count) return @[];

  NSMutableArray<UICollectionViewLayoutAttributes *> *attributes = [NSMutableArray array];
  while (page < count) {
    UICollectionViewLayoutAttributes *attribute = [self layoutAttributesForPage:page];
    if (!attribute || CGRectGetMinY(attribute.frame) >= CGRectGetMaxY(rect)) break;
    if (CGRectIntersectsRect(attribute.frame, rect)) [attributes addObject:attribute];
    page++;
  }
  return attributes;
}

- (BOOL)shouldInvalidateLayoutForBoundsChange:(CGRect)newBounds {
  return !CGSizeEqualToSize(newBounds.size, self.viewportSize);
}
@end

@interface PapyrusComicDocumentView () <UIGestureRecognizerDelegate>
@property (nonatomic, strong) UICollectionView *collectionView;
@property (nonatomic, strong) UICollectionViewFlowLayout *flowLayout;
@property (nonatomic, strong) PapyrusComicContinuousLayout *continuousLayout;
@property (nonatomic, strong) UIPinchGestureRecognizer *pinchRecognizer;
@property (nonatomic, strong) UITapGestureRecognizer *doubleTapRecognizer;
@property (nonatomic, strong) UIPanGestureRecognizer *pagePanRecognizer;
@property (nonatomic, assign) BOOL applyingProgrammaticPage;
@property (nonatomic, strong) NSMutableSet<NSString *> *reportedErrors;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, NSValue *> *pageSizes;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, NSValue *> *pendingPageSizes;
@property (nonatomic, assign) BOOL pendingViewportLayout;
@property (nonatomic, assign) CGSize viewportSize;
@property (nonatomic, assign) NSInteger requestedPage;
@property (nonatomic, assign) BOOL pendingNavigation;
@property (nonatomic, assign) CGPoint panOffset;
@property (nonatomic, assign) CGPoint panGestureStartOffset;
- (void)updateContinuousLayoutGeometry;
- (UICollectionViewLayoutAttributes *)layoutAttributesForItemAtIndexPath:(NSIndexPath *)indexPath;
- (CGSize)pageSizeAtIndex:(NSInteger)page;
@end

@implementation PapyrusComicDocumentView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _pageCount = 0;
    _currentPage = 1;
    _requestedPage = 1;
    _pendingNavigation = YES;
    _pageSizes = [NSMutableDictionary dictionary];
    _pendingPageSizes = [NSMutableDictionary dictionary];
    _layoutMode = @"single";
    _fitMode = @"width";
    _readingDirection = @"ltr";
    _zoom = 1;
    _reportedErrors = [NSMutableSet set];
    _pageTheme = @"normal";
    _flowLayout = [[UICollectionViewFlowLayout alloc] init];
    _flowLayout.minimumLineSpacing = 0;
    _flowLayout.minimumInteritemSpacing = 0;
    _continuousLayout = [[PapyrusComicContinuousLayout alloc] init];
    _collectionView = [[UICollectionView alloc] initWithFrame:self.bounds collectionViewLayout:_flowLayout];
    _collectionView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _collectionView.dataSource = self;
    _collectionView.delegate = self;
    _collectionView.backgroundColor = UIColor.blackColor;
    _collectionView.pagingEnabled = YES;
    _collectionView.showsVerticalScrollIndicator = YES;
    _collectionView.showsHorizontalScrollIndicator = NO;
    [_collectionView registerClass:PapyrusComicPageCell.class forCellWithReuseIdentifier:PapyrusComicCellId];
    [self addSubview:_collectionView];
    _pinchRecognizer = [[UIPinchGestureRecognizer alloc] initWithTarget:self action:@selector(handlePinch:)];
    _pinchRecognizer.cancelsTouchesInView = NO;
    _pinchRecognizer.delegate = self;
    [_collectionView addGestureRecognizer:_pinchRecognizer];
    _doubleTapRecognizer = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(handleDoubleTap:)];
    _doubleTapRecognizer.numberOfTapsRequired = 2;
    _doubleTapRecognizer.numberOfTouchesRequired = 1;
    _doubleTapRecognizer.cancelsTouchesInView = YES;
    _doubleTapRecognizer.delegate = self;
    [_collectionView addGestureRecognizer:_doubleTapRecognizer];
    _pagePanRecognizer = [[UIPanGestureRecognizer alloc] initWithTarget:self action:@selector(handlePagePan:)];
    _pagePanRecognizer.minimumNumberOfTouches = 1;
    _pagePanRecognizer.maximumNumberOfTouches = 1;
    _pagePanRecognizer.cancelsTouchesInView = NO;
    _pagePanRecognizer.delegate = self;
    [_collectionView addGestureRecognizer:_pagePanRecognizer];
    [self applyLayoutMode];
    [self applyTheme];
    [self updateContinuousLayoutGeometry];
  }
  return self;
}

- (void)updateContinuousLayoutGeometry {
  CGSize viewport = self.viewportSize;
  if (viewport.width <= 0 || viewport.height <= 0) viewport = self.collectionView.bounds.size;
  // Recover dimensions already held in the bounded image cache only when
  // document geometry changes, never on each pinch update.
  for (NSInteger page = 0; page < self.pageCount; page++) [self pageSizeAtIndex:page];
  [self.continuousLayout configureWithPageCount:self.pageCount
                                    viewportSize:viewport
                                         fitPage:[self.fitMode isEqualToString:@"page"]
                                      imageSizes:self.pageSizes];
}

- (UICollectionViewLayoutAttributes *)layoutAttributesForItemAtIndexPath:(NSIndexPath *)indexPath {
  return [self.collectionView.collectionViewLayout layoutAttributesForItemAtIndexPath:indexPath];
}

// Anchors reference the page, not an absolute document offset. Heights can change
// above the viewport as images arrive; bitmap eviction must not change geometry.
- (NSDictionary *)captureScrollAnchorForViewport:(CGSize)viewport {
  if (self.pendingNavigation || viewport.width <= 0 || viewport.height <= 0) return nil;
  CGPoint center = CGPointMake(self.collectionView.contentOffset.x + viewport.width / 2,
                               self.collectionView.contentOffset.y + viewport.height / 2);
  UICollectionViewLayoutAttributes *nearest = nil;
  CGFloat distance = CGFLOAT_MAX;
  for (NSIndexPath *path in self.collectionView.indexPathsForVisibleItems) {
    UICollectionViewLayoutAttributes *attributes = [self layoutAttributesForItemAtIndexPath:path];
    if (!attributes) continue;
    CGFloat next = ABS(CGRectGetMidY(attributes.frame) - center.y);
    if (next < distance) { nearest = attributes; distance = next; }
    if (CGRectContainsPoint(attributes.frame, center)) { nearest = attributes; break; }
  }
  if (!nearest || nearest.frame.size.height <= 0) return nil;
  return @{ @"pageIndex": @([self logicalPageForItem:nearest.indexPath.item]),
            @"fractionX": @(PapyrusComicZoomAnchorFraction(self.collectionView.contentOffset.x, viewport.width / 2,
                                                             nearest.frame.origin.x, nearest.frame.size.width)),
            @"fraction": @(PapyrusComicZoomAnchorFraction(self.collectionView.contentOffset.y, viewport.height / 2,
                                                           nearest.frame.origin.y, nearest.frame.size.height)) };
}

- (void)restoreScrollAnchor:(NSDictionary *)anchor {
  if (self.collectionView.dragging || self.collectionView.decelerating) return;
  if (!anchor || self.pendingNavigation || ![self.layoutMode isEqualToString:@"continuous"]) return;
  NSInteger page = [anchor[@"pageIndex"] integerValue];
  if (page < 0 || page >= self.pageCount) return;
  NSInteger item = [self itemForLogicalPage:page + 1];
  UICollectionViewLayoutAttributes *attributes = [self layoutAttributesForItemAtIndexPath:[NSIndexPath indexPathForItem:item inSection:0]];
  if (!attributes) return;
  CGFloat x = PapyrusComicZoomAnchorOffset(attributes.frame.origin.x, attributes.frame.size.width,
      [anchor[@"fractionX"] doubleValue], self.collectionView.bounds.size.width / 2,
      self.collectionView.contentSize.width, self.collectionView.bounds.size.width,
      self.collectionView.adjustedContentInset.left, self.collectionView.adjustedContentInset.right);
  CGFloat y = PapyrusComicZoomAnchorOffset(attributes.frame.origin.y, attributes.frame.size.height,
      [anchor[@"fraction"] doubleValue], self.collectionView.bounds.size.height / 2,
      self.collectionView.contentSize.height, self.collectionView.bounds.size.height,
      self.collectionView.adjustedContentInset.top, self.collectionView.adjustedContentInset.bottom);
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  [self.collectionView setContentOffset:CGPointMake(x, y) animated:NO];
  self.applyingProgrammaticPage = wasApplying;
}

- (void)layoutSubviews {
  NSDictionary *anchor = [self captureScrollAnchorForViewport:self.viewportSize];
  [super layoutSubviews];
  CGSize size = self.collectionView.bounds.size;
  if (CGSizeEqualToSize(size, self.viewportSize)) {
    if (self.pendingNavigation) [self scrollToCurrentPageAnimated:NO];
    return;
  }
  if (self.collectionView.dragging || self.collectionView.decelerating) {
    self.pendingViewportLayout = YES;
    return;
  }
  self.pendingViewportLayout = NO;
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  self.viewportSize = size;
  self.flowLayout.itemSize = size;
  if ([self.layoutMode isEqualToString:@"continuous"]) {
    [self updateContinuousLayoutGeometry];
    self.continuousLayout.zoomScale = self.zoom;
  } else {
    [self.flowLayout invalidateLayout];
  }
  [self.collectionView layoutIfNeeded];
  for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) {
    [self configureCell:cell withImage:cell.imageView.image];
    [self applyImageTransformToCell:cell];
  }
  if (self.pendingNavigation || ![self.layoutMode isEqualToString:@"continuous"]) {
    [self scrollToCurrentPageAnimated:NO];
  } else {
    [self restoreScrollAnchor:anchor];
  }
  self.applyingProgrammaticPage = wasApplying;
}

- (void)setEngineId:(NSString *)engineId {
  if ([_engineId isEqualToString:engineId]) return;
  _engineId = [engineId copy];
  [self.pageSizes removeAllObjects];
  [self.pendingPageSizes removeAllObjects];
  [self updateContinuousLayoutGeometry];
  @synchronized (self.reportedErrors) { [self.reportedErrors removeAllObjects]; }
  self.pendingNavigation = YES;
  [self.collectionView reloadData];
  [self scrollToCurrentPageAnimated:NO];
}
- (void)setDocumentGeneration:(NSInteger)value {
  if (_documentGeneration == value) return;
  _documentGeneration = value;
  [self.pageSizes removeAllObjects];
  [self.pendingPageSizes removeAllObjects];
  [self updateContinuousLayoutGeometry];
  @synchronized (self.reportedErrors) { [self.reportedErrors removeAllObjects]; }
  self.pendingNavigation = YES;
  [self.collectionView reloadData];
  [self scrollToCurrentPageAnimated:NO];
}
- (void)setPageCount:(NSInteger)value {
  NSInteger count = MAX(0, value);
  if (_pageCount == count) return;
  _pageCount = count;
  _currentPage = count > 0 ? MIN(self.requestedPage, count) : self.requestedPage;
  [self updateContinuousLayoutGeometry];
  self.pendingNavigation = YES;
  [self.collectionView reloadData];
  [self scrollToCurrentPageAnimated:NO];
}
- (void)setCurrentPage:(NSInteger)value {
  NSInteger requested = MAX(value, 1);
  NSInteger safe = self.pageCount > 0 ? MIN(requested, self.pageCount) : requested;
  if (_currentPage == safe && self.requestedPage == requested) return;
  self.requestedPage = requested;
  _currentPage = safe;
  self.pendingNavigation = YES;
  [self scrollToCurrentPageAnimated:NO];
}
- (void)setLayoutMode:(NSString *)value {
  NSString *mode = [value isEqualToString:@"continuous"] ? @"continuous" : @"single";
  if ([_layoutMode isEqualToString:mode]) return;
  _layoutMode = mode;
  self.panOffset = CGPointZero;
  [self applyLayoutMode];
  self.pendingNavigation = YES;
  [self.collectionView reloadData];
  [self scrollToCurrentPageAnimated:NO];
}
- (void)setFitMode:(NSString *)value {
  NSString *mode = [value isEqualToString:@"page"] ? @"page" : @"width";
  if ([_fitMode isEqualToString:mode]) return;
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  NSDictionary *anchor = [self captureScrollAnchorForViewport:self.collectionView.bounds.size];
  _fitMode = mode;
  if ([self.layoutMode isEqualToString:@"continuous"]) [self updateContinuousLayoutGeometry];
  [self.collectionView.collectionViewLayout invalidateLayout];
  [self.collectionView reloadData];
  [self.collectionView layoutIfNeeded];
  if ([self.layoutMode isEqualToString:@"continuous"]) [self restoreScrollAnchor:anchor];
  else [self scrollToCurrentPageAnimated:NO];
  self.applyingProgrammaticPage = wasApplying;
}
- (void)setReadingDirection:(NSString *)value {
  NSString *direction = [value isEqualToString:@"rtl"] ? @"rtl" : @"ltr";
  if ([_readingDirection isEqualToString:direction]) return;
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  NSDictionary *anchor = [self captureScrollAnchorForViewport:self.collectionView.bounds.size];
  _readingDirection = direction;
  [self applyLayoutMode];
  [self.collectionView reloadData];
  [self.collectionView layoutIfNeeded];
  if ([self.layoutMode isEqualToString:@"continuous"]) [self restoreScrollAnchor:anchor];
  else [self scrollToCurrentPageAnimated:NO];
  self.applyingProgrammaticPage = wasApplying;
}
- (void)setZoom:(CGFloat)value {
  CGFloat target = PapyrusComicClampZoom(value);
  if (fabs(target - _zoom) < 0.0001) {
    [self updateZoomGestureAvailability];
    return;
  }
  CGPoint focus = CGPointMake(self.collectionView.bounds.size.width / 2, self.collectionView.bounds.size.height / 2);
  if ([self.layoutMode isEqualToString:@"continuous"]) [self applyContinuousZoom:target atFocus:focus];
  else [self applySingleZoom:target atFocus:focus];
}

- (CGAffineTransform)imageTransform {
  CGAffineTransform transform = CGAffineTransformMakeTranslation(self.panOffset.x, self.panOffset.y);
  return CGAffineTransformScale(transform, self.zoom, self.zoom);
}

- (void)applyImageTransformToCell:(PapyrusComicPageCell *)cell {
  cell.imageView.transform = [self.layoutMode isEqualToString:@"continuous"] ? CGAffineTransformIdentity : [self imageTransform];
}

- (void)updateZoomGestureAvailability {
  BOOL continuous = [self.layoutMode isEqualToString:@"continuous"];
  BOOL collectionCanPan = continuous || self.zoom <= 1.0;
  BOOL pageCanPan = !continuous && self.zoom > 1.0;
  if (self.collectionView.panGestureRecognizer.enabled != collectionCanPan) {
    self.collectionView.panGestureRecognizer.enabled = collectionCanPan;
  }
  if (self.pagePanRecognizer.enabled != pageCanPan) self.pagePanRecognizer.enabled = pageCanPan;
}

- (NSDictionary *)captureContinuousZoomAnchorAtFocus:(CGPoint)focus {
  if (![self.layoutMode isEqualToString:@"continuous"] || self.pageCount <= 0) return nil;
  CGPoint contentFocus = CGPointMake(self.collectionView.contentOffset.x + focus.x,
                                     self.collectionView.contentOffset.y + focus.y);
  UICollectionViewLayoutAttributes *nearest = nil;
  CGFloat nearestDistance = CGFLOAT_MAX;
  for (NSIndexPath *path in self.collectionView.indexPathsForVisibleItems) {
    UICollectionViewLayoutAttributes *attributes = [self layoutAttributesForItemAtIndexPath:path];
    if (!attributes || attributes.frame.size.width <= 0 || attributes.frame.size.height <= 0) continue;
    if (CGRectContainsPoint(attributes.frame, contentFocus)) { nearest = attributes; break; }
    CGFloat dx = MAX(CGRectGetMinX(attributes.frame) - contentFocus.x, MAX(0, contentFocus.x - CGRectGetMaxX(attributes.frame)));
    CGFloat dy = MAX(CGRectGetMinY(attributes.frame) - contentFocus.y, MAX(0, contentFocus.y - CGRectGetMaxY(attributes.frame)));
    CGFloat distance = dx * dx + dy * dy;
    if (distance < nearestDistance) { nearest = attributes; nearestDistance = distance; }
  }
  if (!nearest) return nil;
  return @{ @"pageIndex": @([self logicalPageForItem:nearest.indexPath.item]),
            @"fractionX": @(PapyrusComicZoomAnchorFraction(self.collectionView.contentOffset.x, focus.x,
                                                             nearest.frame.origin.x, nearest.frame.size.width)),
            @"fractionY": @(PapyrusComicZoomAnchorFraction(self.collectionView.contentOffset.y, focus.y,
                                                             nearest.frame.origin.y, nearest.frame.size.height)) };
}

- (void)restoreContinuousZoomAnchor:(NSDictionary *)anchor atFocus:(CGPoint)focus {
  if (!anchor || ![self.layoutMode isEqualToString:@"continuous"] || self.pendingNavigation) return;
  NSInteger page = [anchor[@"pageIndex"] integerValue];
  if (page < 0 || page >= self.pageCount) return;
  NSInteger item = [self itemForLogicalPage:page + 1];
  NSIndexPath *path = [NSIndexPath indexPathForItem:item inSection:0];
  UICollectionViewLayoutAttributes *attributes = [self layoutAttributesForItemAtIndexPath:path];
  if (!attributes) return;
  CGFloat x = PapyrusComicZoomAnchorOffset(attributes.frame.origin.x, attributes.frame.size.width,
      [anchor[@"fractionX"] doubleValue], focus.x, self.collectionView.contentSize.width,
      self.collectionView.bounds.size.width, self.collectionView.adjustedContentInset.left,
      self.collectionView.adjustedContentInset.right);
  CGFloat y = PapyrusComicZoomAnchorOffset(attributes.frame.origin.y, attributes.frame.size.height,
      [anchor[@"fractionY"] doubleValue], focus.y, self.collectionView.contentSize.height,
      self.collectionView.bounds.size.height, self.collectionView.adjustedContentInset.top,
      self.collectionView.adjustedContentInset.bottom);
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  [self.collectionView setContentOffset:CGPointMake(x, y) animated:NO];
  self.applyingProgrammaticPage = wasApplying;
}

- (void)applyContinuousZoom:(CGFloat)target atFocus:(CGPoint)focus {
  CGFloat next = PapyrusComicClampZoom(target);
  if (fabs(next - self.zoom) < 0.0001) return;
  os_log_t signpostLog = PapyrusComicZoomSignpostLog();
  os_signpost_id_t signpostId = os_signpost_id_generate(signpostLog);
  os_signpost_interval_begin(signpostLog, signpostId, "ContinuousZoom");
  NSDictionary *anchor = [self captureContinuousZoomAnchorAtFocus:focus];
  _zoom = next;
  self.panOffset = CGPointZero;
  [self updateZoomGestureAvailability];
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  self.continuousLayout.zoomScale = next;
  [self.collectionView layoutIfNeeded];
  [self restoreContinuousZoomAnchor:anchor atFocus:focus];
  self.applyingProgrammaticPage = wasApplying;
  if (!wasApplying) [self emitVisiblePage];
  os_signpost_interval_end(signpostLog, signpostId, "ContinuousZoom");
}

- (void)applySingleZoom:(CGFloat)target atFocus:(CGPoint)focus {
  CGFloat previous = MAX(1, self.zoom);
  CGFloat next = PapyrusComicClampZoom(target);
  if (next <= 1.0) {
    self.panOffset = CGPointZero;
  } else {
    CGFloat ratio = next / previous;
    CGPoint center = CGPointMake(self.collectionView.bounds.size.width / 2, self.collectionView.bounds.size.height / 2);
    CGFloat maxX = self.collectionView.bounds.size.width * (next - 1.0) / 2.0;
    CGFloat maxY = self.collectionView.bounds.size.height * (next - 1.0) / 2.0;
    CGFloat x = ratio * self.panOffset.x + (1 - ratio) * (focus.x - center.x);
    CGFloat y = ratio * self.panOffset.y + (1 - ratio) * (focus.y - center.y);
    self.panOffset = CGPointMake(MAX(-maxX, MIN(maxX, x)), MAX(-maxY, MIN(maxY, y)));
  }
  _zoom = next;
  [self updateZoomGestureAvailability];
  for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) [self applyImageTransformToCell:cell];
}
- (void)setPageTheme:(NSString *)value {
  _pageTheme = [value copy] ?: @"normal";
  [self applyTheme];
}

- (void)applyLayoutMode {
  BOOL continuous = [self.layoutMode isEqualToString:@"continuous"];
  self.flowLayout.scrollDirection = UICollectionViewScrollDirectionHorizontal;
  self.flowLayout.itemSize = self.collectionView.bounds.size;
  self.collectionView.pagingEnabled = !continuous;
  self.collectionView.semanticContentAttribute = [self.readingDirection isEqualToString:@"rtl"] ? UISemanticContentAttributeForceRightToLeft : UISemanticContentAttributeForceLeftToRight;
  if (continuous) {
    [self updateContinuousLayoutGeometry];
    self.continuousLayout.zoomScale = self.zoom;
    if (self.collectionView.collectionViewLayout != self.continuousLayout) {
      [self.collectionView setCollectionViewLayout:self.continuousLayout animated:NO];
    }
  } else {
    if (self.collectionView.collectionViewLayout != self.flowLayout) {
      [self.collectionView setCollectionViewLayout:self.flowLayout animated:NO];
    }
    [self.flowLayout invalidateLayout];
  }
  [self updateZoomGestureAvailability];
}

- (void)applyTheme {
  UIColor *background = [self.pageTheme isEqualToString:@"sepia"] ? [UIColor colorWithRed:0.90 green:0.86 blue:0.77 alpha:1] :
    [self.pageTheme isEqualToString:@"dark"] ? [UIColor colorWithRed:0.08 green:0.08 blue:0.09 alpha:1] : UIColor.blackColor;
  self.backgroundColor = background;
  self.collectionView.backgroundColor = background;
}

- (void)configureCell:(PapyrusComicPageCell *)cell withImage:(UIImage *)image {
  cell.fitWidthInSingleMode = [self.layoutMode isEqualToString:@"single"] &&
    [self.fitMode isEqualToString:@"width"] && image.size.width > 0 && image.size.height > 0;
  [cell setNeedsLayout];
  [cell layoutIfNeeded];
}

- (void)emitErrorForKey:(NSString *)key message:(NSString *)message {
  @synchronized (self.reportedErrors) {
    if ([self.reportedErrors containsObject:key]) return;
    [self.reportedErrors addObject:key];
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.onError) self.onError(@{@"message": message.length ? message : @"Unsupported or corrupt comic image"});
  });
}

- (NSInteger)logicalPageForItem:(NSInteger)item {
  return item;
}
- (NSInteger)itemForLogicalPage:(NSInteger)page {
  return MIN(MAX(0, page - 1), MAX(0, self.pageCount - 1));
}
- (void)scrollToCurrentPageAnimated:(BOOL)animated {
  if (self.pageCount <= 0 || self.collectionView.bounds.size.width <= 0) return;
  [self.collectionView layoutIfNeeded];
  NSInteger item = [self itemForLogicalPage:self.currentPage];
  if (item >= [self.collectionView numberOfItemsInSection:0]) return;
  self.pendingNavigation = NO;
  self.applyingProgrammaticPage = YES;
  [self.collectionView scrollToItemAtIndexPath:[NSIndexPath indexPathForItem:item inSection:0]
                              atScrollPosition:[self.layoutMode isEqualToString:@"continuous"] ? UICollectionViewScrollPositionTop : UICollectionViewScrollPositionCenteredHorizontally
                                      animated:animated];
  dispatch_async(dispatch_get_main_queue(), ^{ self.applyingProgrammaticPage = NO; });
}

- (NSInteger)numberOfSectionsInCollectionView:(UICollectionView *)collectionView {
  #pragma unused(collectionView)
  return 1;
}
- (NSInteger)collectionView:(UICollectionView *)collectionView numberOfItemsInSection:(NSInteger)section {
  #pragma unused(collectionView, section)
  return self.pageCount;
}

- (__kindof UICollectionViewCell *)collectionView:(UICollectionView *)collectionView cellForItemAtIndexPath:(NSIndexPath *)indexPath {
  PapyrusComicPageCell *cell = [collectionView dequeueReusableCellWithReuseIdentifier:PapyrusComicCellId forIndexPath:indexPath];
  NSInteger pageIndex = [self logicalPageForItem:indexPath.item];
  NSString *engineId = self.engineId;
  NSInteger generation = self.documentGeneration;
  NSString *key = [NSString stringWithFormat:@"%@:%ld:%ld", engineId ?: @"", (long)generation, (long)pageIndex];
  cell.representedKey = key;
  cell.imageView.image = [PapyrusComicImageCache() objectForKey:key];
  [self configureCell:cell withImage:cell.imageView.image];
  [self applyImageTransformToCell:cell];
  if (!cell.imageView.image && engineId.length > 0 && generation > 0) {
    NSInteger maximumEdge = MAX(1024, (NSInteger)MAX(self.bounds.size.width, self.bounds.size.height) * 2);
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      char path[4096] = {};
      char error[512] = {};
      if (!papyrus_comic_extract_page(engineId.UTF8String, (int)generation, (int)pageIndex, path, sizeof(path), error, sizeof(error))) {
        [self emitErrorForKey:key message:error[0] ? [NSString stringWithUTF8String:error] : nil];
        return;
      }
      NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
      CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
      if (!source) { [self emitErrorForKey:key message:@"Unsupported or corrupt comic image"]; return; }
      CFDictionaryRef properties = CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
      NSDictionary *metadata = properties ? CFBridgingRelease(properties) : @{};
      NSUInteger width = [metadata[(id)kCGImagePropertyPixelWidth] unsignedIntegerValue];
      NSUInteger height = [metadata[(id)kCGImagePropertyPixelHeight] unsignedIntegerValue];
      if (width == 0 || height == 0 || width > 20000 || height > 20000 || width * height > 80000000ULL) {
        CFRelease(source);
        [self emitErrorForKey:key message:@"Comic image exceeds supported dimensions"];
        return;
      }
      CGFloat scale = MIN(1.0, MIN((CGFloat)maximumEdge / (CGFloat)MAX(width, height), sqrt(8000000.0 / ((double)width * (double)height))));
      NSInteger boundedMaximumEdge = MAX(1, (NSInteger)ceil((double)MAX(width, height) * scale));
      NSDictionary *options = @{
        (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
        (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize: @(boundedMaximumEdge),
        (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform: @YES,
      };
      CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
      CFRelease(source);
      if (!image) { [self emitErrorForKey:key message:@"Unsupported or corrupt comic image"]; return; }
      UIImage *page = [UIImage imageWithCGImage:image scale:UIScreen.mainScreen.scale orientation:UIImageOrientationUp];
      NSUInteger cost = CGImageGetBytesPerRow(image) * CGImageGetHeight(image);
      CGImageRelease(image);
      [PapyrusComicImageCache() setObject:page forKey:key cost:cost];
      dispatch_async(dispatch_get_main_queue(), ^{
        if (![self.engineId isEqualToString:engineId] || self.documentGeneration != generation) return;
        self.pendingPageSizes[@(pageIndex)] = [NSValue valueWithCGSize:page.size];
        [self applyPendingPageSizes];
        if ([cell.representedKey isEqualToString:key]) {
          cell.imageView.image = page;
          [self configureCell:cell withImage:page];
          [self applyImageTransformToCell:cell];
        }
      });
    });
  }
  return cell;
}

// Keep geometry fixed during the native gesture; one compensation happens at idle.
- (void)applyPendingPageSizes {
  if (self.collectionView.dragging || self.collectionView.decelerating) return;
  if (self.pinchRecognizer.state == UIGestureRecognizerStateBegan || self.pinchRecognizer.state == UIGestureRecognizerStateChanged) return;
  if (self.pendingViewportLayout) { [self setNeedsLayout]; [self layoutIfNeeded]; }
  if (self.pendingPageSizes.count == 0) return;
  NSDictionary *anchor = [self captureScrollAnchorForViewport:self.collectionView.bounds.size];
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  NSDictionary<NSNumber *, NSValue *> *pageSizeUpdates = [self.pendingPageSizes copy];
  [self.pageSizes addEntriesFromDictionary:self.pendingPageSizes];
  [self.pendingPageSizes removeAllObjects];
  [self.continuousLayout updateImageSizes:pageSizeUpdates];
  [self.collectionView.collectionViewLayout invalidateLayout];
  [self.collectionView layoutIfNeeded];
  [self restoreScrollAnchor:anchor];
  self.applyingProgrammaticPage = wasApplying;
  if (!wasApplying) [self emitVisiblePage];
}

- (CGSize)pageSizeAtIndex:(NSInteger)page {
  NSValue *known = self.pageSizes[@(page)];
  if (known) return known.CGSizeValue;
  NSString *key = [NSString stringWithFormat:@"%@:%ld:%ld", self.engineId ?: @"", (long)self.documentGeneration, (long)page];
  if (self.pendingPageSizes[@(page)]) return CGSizeZero;
  UIImage *cached = [PapyrusComicImageCache() objectForKey:key];
  if (cached) self.pageSizes[@(page)] = [NSValue valueWithCGSize:cached.size];
  return cached ? cached.size : CGSizeZero;
}

- (CGSize)collectionView:(UICollectionView *)collectionView layout:(UICollectionViewLayout *)layout sizeForItemAtIndexPath:(NSIndexPath *)indexPath {
  #pragma unused(layout, indexPath)
  return collectionView.bounds.size;
}

- (void)scrollViewDidEndDragging:(UIScrollView *)scrollView willDecelerate:(BOOL)decelerate {
  #pragma unused(scrollView)
  if (!decelerate) [self applyPendingPageSizes];
  [self emitVisiblePage];
}

- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView {
  #pragma unused(scrollView)
  [self applyPendingPageSizes];
  [self emitVisiblePage];
}
- (void)scrollViewDidEndScrollingAnimation:(UIScrollView *)scrollView {
  #pragma unused(scrollView)
  [self applyPendingPageSizes];
  [self emitVisiblePage];
}
- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
  #pragma unused(scrollView)
  if (!self.applyingProgrammaticPage) [self emitVisiblePage];
}

- (void)emitVisiblePage {
  if (self.applyingProgrammaticPage || self.pendingNavigation || self.pageCount <= 0) return;
  CGPoint center = CGPointMake(self.collectionView.contentOffset.x + self.collectionView.bounds.size.width / 2,
                               self.collectionView.contentOffset.y + self.collectionView.bounds.size.height / 2);
  NSIndexPath *indexPath = [self.collectionView indexPathForItemAtPoint:center];
  if (!indexPath) return;
  NSInteger page = [self logicalPageForItem:indexPath.item] + 1;
  if (page == self.currentPage) return;
  _currentPage = page;
  self.requestedPage = page;
  if (self.onPageChanged) self.onPageChanged(@{ @"page": @(page) });
}

- (void)handleDoubleTap:(UITapGestureRecognizer *)recognizer {
  if (recognizer.state != UIGestureRecognizerStateRecognized ||
      self.pinchRecognizer.state == UIGestureRecognizerStateChanged) return;
  CGFloat previous = MAX(1, self.zoom);
  CGFloat target = previous > 1.05 ? 1.0 : 2.0;
  CGPoint focus = [recognizer locationInView:self];
  if ([self.layoutMode isEqualToString:@"continuous"]) [self applyContinuousZoom:target atFocus:focus];
  else [self applySingleZoom:target atFocus:focus];
  if (self.onZoomChanged) self.onZoomChanged(@{ @"zoom": @(self.zoom) });
}

- (void)handlePinch:(UIPinchGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateChanged) {
    CGFloat target = PapyrusComicClampZoom(self.zoom * recognizer.scale);
    // The collection fills this view. Its own UIScrollView coordinates can
    // include contentOffset; the enclosing view keeps the focus viewport-local.
    CGPoint focus = [recognizer locationInView:self];
    if ([self.layoutMode isEqualToString:@"continuous"]) [self applyContinuousZoom:target atFocus:focus];
    else [self applySingleZoom:target atFocus:focus];
    recognizer.scale = 1;
  } else if (recognizer.state == UIGestureRecognizerStateEnded || recognizer.state == UIGestureRecognizerStateCancelled || recognizer.state == UIGestureRecognizerStateFailed) {
    [self applyPendingPageSizes];
    if (self.onZoomChanged) self.onZoomChanged(@{ @"zoom": @(self.zoom) });
  }
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer shouldRecognizeSimultaneouslyWithGestureRecognizer:(UIGestureRecognizer *)otherGestureRecognizer {
  return gestureRecognizer == self.pinchRecognizer || otherGestureRecognizer == self.pinchRecognizer;
}

- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer shouldReceiveTouch:(UITouch *)touch {
  #pragma unused(touch)
  if (gestureRecognizer == self.pagePanRecognizer) return ![self.layoutMode isEqualToString:@"continuous"] && self.zoom > 1.0;
  return YES;
}

- (void)handlePagePan:(UIPanGestureRecognizer *)recognizer {
  if ([self.layoutMode isEqualToString:@"continuous"] || self.zoom <= 1.0) return;
  if (recognizer.state == UIGestureRecognizerStateBegan) {
    self.panGestureStartOffset = self.panOffset;
  } else if (recognizer.state == UIGestureRecognizerStateChanged) {
    CGPoint translation = [recognizer translationInView:self.collectionView];
    CGFloat maxX = self.collectionView.bounds.size.width * (self.zoom - 1.0) / 2.0;
    CGFloat maxY = self.collectionView.bounds.size.height * (self.zoom - 1.0) / 2.0;
    self.panOffset = CGPointMake(
      MAX(-maxX, MIN(maxX, translation.x + self.panGestureStartOffset.x)),
      MAX(-maxY, MIN(maxY, translation.y + self.panGestureStartOffset.y))
    );
    for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) [self applyImageTransformToCell:cell];
  } else if (recognizer.state == UIGestureRecognizerStateEnded || recognizer.state == UIGestureRecognizerStateCancelled || recognizer.state == UIGestureRecognizerStateFailed) {
    [self applyPendingPageSizes];
  }
}

@end
