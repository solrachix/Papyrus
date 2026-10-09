#import "PapyrusComicDocumentView.h"
#import "../vendor/libarchive/PapyrusComicArchive.h"
#import <ImageIO/ImageIO.h>
#import <math.h>

static NSString * const PapyrusComicCellId = @"PapyrusComicPageCell";
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
- (void)prepareForReuse {
  [super prepareForReuse];
  self.pageScrollView.contentOffset = CGPointZero;
  self.pageScrollView.contentSize = self.pageScrollView.bounds.size;
  self.pageScrollView.scrollEnabled = NO;
  self.pageScrollView.alwaysBounceVertical = NO;
  self.imageView.image = nil;
  self.imageView.transform = CGAffineTransformIdentity;
}
@end

@interface PapyrusComicDocumentView () <UIGestureRecognizerDelegate>
@property (nonatomic, strong) UICollectionView *collectionView;
@property (nonatomic, strong) UICollectionViewFlowLayout *flowLayout;
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
  }
  return self;
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
    UICollectionViewLayoutAttributes *attributes = [self.flowLayout layoutAttributesForItemAtIndexPath:path];
    if (!attributes) continue;
    CGFloat next = ABS(CGRectGetMidY(attributes.frame) - center.y);
    if (next < distance) { nearest = attributes; distance = next; }
    if (CGRectContainsPoint(attributes.frame, center)) { nearest = attributes; break; }
  }
  if (!nearest || nearest.frame.size.height <= 0) return nil;
  return @{ @"pageIndex": @([self logicalPageForItem:nearest.indexPath.item]),
            @"fraction": @(MAX(0, MIN(1, (center.y - nearest.frame.origin.y) / nearest.frame.size.height))) };
}

- (void)restoreScrollAnchor:(NSDictionary *)anchor {
  if (self.collectionView.dragging || self.collectionView.decelerating) return;
  if (!anchor || self.pendingNavigation || ![self.layoutMode isEqualToString:@"continuous"]) return;
  NSInteger page = [anchor[@"pageIndex"] integerValue];
  if (page < 0 || page >= self.pageCount) return;
  NSInteger item = [self itemForLogicalPage:page + 1];
  UICollectionViewLayoutAttributes *attributes = [self.flowLayout layoutAttributesForItemAtIndexPath:[NSIndexPath indexPathForItem:item inSection:0]];
  if (!attributes) return;
  CGFloat y = attributes.frame.origin.y + [anchor[@"fraction"] doubleValue] * attributes.frame.size.height - self.collectionView.bounds.size.height / 2;
  CGFloat minimum = -self.collectionView.adjustedContentInset.top;
  CGFloat maximum = MAX(minimum, self.collectionView.contentSize.height - self.collectionView.bounds.size.height + self.collectionView.adjustedContentInset.bottom);
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  [self.collectionView setContentOffset:CGPointMake(self.collectionView.contentOffset.x, MAX(minimum, MIN(maximum, y))) animated:NO];
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
  [self.flowLayout invalidateLayout];
  [self.collectionView layoutIfNeeded];
  for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) {
    [self configureCell:cell withImage:cell.imageView.image];
    cell.imageView.transform = [self imageTransform];
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
  [self.flowLayout invalidateLayout];
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
  _zoom = MAX(1, MIN(5, value));
  self.collectionView.panGestureRecognizer.enabled = _zoom <= 1.0;
  self.pagePanRecognizer.enabled = _zoom > 1.0;
  if (_zoom <= 1.0) self.panOffset = CGPointZero;
  for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) {
    cell.imageView.transform = [self imageTransform];
  }
}

- (CGAffineTransform)imageTransform {
  CGAffineTransform transform = CGAffineTransformMakeTranslation(self.panOffset.x, self.panOffset.y);
  return CGAffineTransformScale(transform, self.zoom, self.zoom);
}
- (void)setPageTheme:(NSString *)value {
  _pageTheme = [value copy] ?: @"normal";
  [self applyTheme];
}

- (void)applyLayoutMode {
  BOOL continuous = [self.layoutMode isEqualToString:@"continuous"];
  self.flowLayout.scrollDirection = continuous ? UICollectionViewScrollDirectionVertical : UICollectionViewScrollDirectionHorizontal;
  self.collectionView.pagingEnabled = !continuous;
  self.collectionView.semanticContentAttribute = [self.readingDirection isEqualToString:@"rtl"] ? UISemanticContentAttributeForceRightToLeft : UISemanticContentAttributeForceLeftToRight;
  [self.flowLayout invalidateLayout];
}

- (void)applyTheme {
  UIColor *background = [self.pageTheme isEqualToString:@"sepia"] ? [UIColor colorWithRed:0.90 green:0.86 blue:0.77 alpha:1] :
    [self.pageTheme isEqualToString:@"dark"] ? [UIColor colorWithRed:0.08 green:0.08 blue:0.09 alpha:1] : UIColor.blackColor;
  self.backgroundColor = background;
  self.collectionView.backgroundColor = background;
}

- (void)configureCell:(PapyrusComicPageCell *)cell withImage:(UIImage *)image {
  CGRect bounds = cell.contentView.bounds;
  cell.pageScrollView.frame = bounds;
  BOOL fitWidthInSingleMode = [self.layoutMode isEqualToString:@"single"] &&
    [self.fitMode isEqualToString:@"width"] && image.size.width > 0 && image.size.height > 0;
  if (fitWidthInSingleMode) {
    CGFloat height = bounds.size.width * image.size.height / image.size.width;
    cell.imageView.frame = CGRectMake(0, 0, bounds.size.width, MAX(1, height));
    cell.pageScrollView.contentSize = cell.imageView.frame.size;
    cell.pageScrollView.scrollEnabled = height > bounds.size.height;
    cell.pageScrollView.alwaysBounceVertical = height > bounds.size.height;
  } else {
    cell.imageView.frame = cell.pageScrollView.bounds;
    cell.pageScrollView.contentSize = cell.pageScrollView.bounds.size;
    cell.pageScrollView.scrollEnabled = NO;
    cell.pageScrollView.alwaysBounceVertical = NO;
  }
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
  cell.imageView.transform = [self imageTransform];
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
          cell.imageView.transform = [self imageTransform];
        }
      });
    });
  }
  return cell;
}

// Keep geometry fixed during the native gesture; one compensation happens at idle.
- (void)applyPendingPageSizes {
  if (self.collectionView.dragging || self.collectionView.decelerating) return;
  if (self.pendingViewportLayout) { [self setNeedsLayout]; [self layoutIfNeeded]; }
  if (self.pendingPageSizes.count == 0) return;
  NSDictionary *anchor = [self captureScrollAnchorForViewport:self.collectionView.bounds.size];
  BOOL wasApplying = self.applyingProgrammaticPage;
  self.applyingProgrammaticPage = YES;
  [self.pageSizes addEntriesFromDictionary:self.pendingPageSizes];
  [self.pendingPageSizes removeAllObjects];
  [self.flowLayout invalidateLayout];
  [self.collectionView layoutIfNeeded];
  [self restoreScrollAnchor:anchor];
  self.applyingProgrammaticPage = wasApplying;
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
  #pragma unused(layout)
  if (![self.layoutMode isEqualToString:@"continuous"]) return collectionView.bounds.size;
  NSInteger page = [self logicalPageForItem:indexPath.item];
  CGSize imageSize = [self pageSizeAtIndex:page];
  CGSize viewport = self.pendingViewportLayout && self.viewportSize.width > 0 ? self.viewportSize : collectionView.bounds.size;
  if (imageSize.width <= 0 || imageSize.height <= 0) return viewport;
  CGFloat width = viewport.width;
  CGFloat height = width * imageSize.height / imageSize.width;
  if ([self.fitMode isEqualToString:@"page"]) height = MIN(height, viewport.height);
  return CGSizeMake(width, MAX(1, height));
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
  CGPoint focus = [recognizer locationInView:self.collectionView];
  CGPoint center = CGPointMake(CGRectGetMidX(self.collectionView.bounds),
                               CGRectGetMidY(self.collectionView.bounds));
  if (target <= 1.0) {
    self.panOffset = CGPointZero;
  } else {
    CGFloat ratio = target / previous;
    CGFloat maxX = self.collectionView.bounds.size.width * (target - 1.0) / 2.0;
    CGFloat maxY = self.collectionView.bounds.size.height * (target - 1.0) / 2.0;
    CGFloat x = ratio * self.panOffset.x + (1 - ratio) * (focus.x - center.x);
    CGFloat y = ratio * self.panOffset.y + (1 - ratio) * (focus.y - center.y);
    self.panOffset = CGPointMake(MAX(-maxX, MIN(maxX, x)), MAX(-maxY, MIN(maxY, y)));
  }
  self.zoom = target;
  if (self.onZoomChanged) self.onZoomChanged(@{ @"zoom": @(self.zoom) });
}

- (void)handlePinch:(UIPinchGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateChanged) {
    self.zoom = MAX(1, MIN(5, self.zoom * recognizer.scale));
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
  if (gestureRecognizer == self.pagePanRecognizer) return self.zoom > 1.0;
  return YES;
}

- (void)handlePagePan:(UIPanGestureRecognizer *)recognizer {
  if (self.zoom <= 1.0) return;
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
    for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) cell.imageView.transform = [self imageTransform];
  } else if (recognizer.state == UIGestureRecognizerStateEnded || recognizer.state == UIGestureRecognizerStateCancelled || recognizer.state == UIGestureRecognizerStateFailed) {
    [self applyPendingPageSizes];
  }
}

@end
