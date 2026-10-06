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
@property (nonatomic, strong) UIPanGestureRecognizer *pagePanRecognizer;
@property (nonatomic, assign) BOOL applyingProgrammaticPage;
@property (nonatomic, strong) NSMutableSet<NSString *> *reportedErrors;
@property (nonatomic, assign) CGPoint panOffset;
@property (nonatomic, assign) CGPoint panGestureStartOffset;
@end

@implementation PapyrusComicDocumentView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _pageCount = 0;
    _currentPage = 1;
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

- (void)layoutSubviews {
  [super layoutSubviews];
  self.flowLayout.itemSize = self.bounds.size;
  [self.flowLayout invalidateLayout];
  for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) {
    [self configureCell:cell withImage:cell.imageView.image];
    cell.imageView.transform = [self imageTransform];
  }
  [self scrollToCurrentPageAnimated:NO];
}

- (void)setEngineId:(NSString *)engineId {
  if ([_engineId isEqualToString:engineId]) return;
  _engineId = [engineId copy];
  [self.collectionView reloadData];
}
- (void)setDocumentGeneration:(NSInteger)value {
  if (_documentGeneration == value) return;
  _documentGeneration = value;
  [self.collectionView reloadData];
}
- (void)setPageCount:(NSInteger)value {
  _pageCount = MAX(0, value);
  _currentPage = MIN(MAX(_currentPage, 1), MAX(_pageCount, 1));
  [self.collectionView reloadData];
  [self scrollToCurrentPageAnimated:NO];
}
- (void)setCurrentPage:(NSInteger)value {
  NSInteger safe = MIN(MAX(value, 1), MAX(self.pageCount, 1));
  if (_currentPage == safe) return;
  _currentPage = safe;
  [self scrollToCurrentPageAnimated:NO];
}
- (void)setLayoutMode:(NSString *)value {
  _layoutMode = [value isEqualToString:@"continuous"] ? @"continuous" : @"single";
  for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) cell.pageScrollView.contentOffset = CGPointZero;
  [self applyLayoutMode];
  [self.collectionView reloadData];
}
- (void)setFitMode:(NSString *)value {
  _fitMode = [value copy] ?: @"width";
  for (PapyrusComicPageCell *cell in self.collectionView.visibleCells) cell.pageScrollView.contentOffset = CGPointZero;
  [self.flowLayout invalidateLayout];
  [self.collectionView reloadData];
}
- (void)setReadingDirection:(NSString *)value {
  _readingDirection = [value isEqualToString:@"rtl"] ? @"rtl" : @"ltr";
  [self.collectionView reloadData];
  [self scrollToCurrentPageAnimated:NO];
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
  [self scrollToCurrentPageAnimated:NO];
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
  NSInteger item = [self itemForLogicalPage:self.currentPage];
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
        if ([cell.representedKey isEqualToString:key] && [self.engineId isEqualToString:engineId] && self.documentGeneration == generation) {
          cell.imageView.image = page;
          [self configureCell:cell withImage:page];
          cell.imageView.transform = [self imageTransform];
          [self.flowLayout invalidateLayout];
        }
      });
    });
  }
  return cell;
}

- (CGSize)collectionView:(UICollectionView *)collectionView layout:(UICollectionViewLayout *)layout sizeForItemAtIndexPath:(NSIndexPath *)indexPath {
  #pragma unused(layout)
  if (![self.layoutMode isEqualToString:@"continuous"]) return collectionView.bounds.size;
  NSInteger page = [self logicalPageForItem:indexPath.item];
  NSString *key = [NSString stringWithFormat:@"%@:%ld:%ld", self.engineId ?: @"", (long)self.documentGeneration, (long)page];
  UIImage *image = [PapyrusComicImageCache() objectForKey:key];
  if (!image || image.size.width <= 0 || image.size.height <= 0) return collectionView.bounds.size;
  CGFloat width = collectionView.bounds.size.width;
  CGFloat height = width * image.size.height / image.size.width;
  if ([self.fitMode isEqualToString:@"page"]) height = MIN(height, collectionView.bounds.size.height);
  return CGSizeMake(width, MAX(1, height));
}

- (void)scrollViewDidEndDecelerating:(UIScrollView *)scrollView {
  #pragma unused(scrollView)
  [self emitVisiblePage];
}
- (void)scrollViewDidEndScrollingAnimation:(UIScrollView *)scrollView {
  #pragma unused(scrollView)
  [self emitVisiblePage];
}
- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
  #pragma unused(scrollView)
  if (!self.applyingProgrammaticPage) [self emitVisiblePage];
}

- (void)emitVisiblePage {
  if (self.pageCount <= 0) return;
  CGPoint center = CGPointMake(CGRectGetMidX(self.collectionView.bounds) + self.collectionView.contentOffset.x,
                               CGRectGetMidY(self.collectionView.bounds) + self.collectionView.contentOffset.y);
  NSIndexPath *indexPath = [self.collectionView indexPathForItemAtPoint:center];
  if (!indexPath) return;
  NSInteger page = [self logicalPageForItem:indexPath.item] + 1;
  if (page == self.currentPage) return;
  self.currentPage = page;
  if (self.onPageChanged) self.onPageChanged(@{ @"page": @(page) });
}

- (void)handlePinch:(UIPinchGestureRecognizer *)recognizer {
  if (recognizer.state == UIGestureRecognizerStateChanged) {
    self.zoom = MAX(1, MIN(5, self.zoom * recognizer.scale));
    recognizer.scale = 1;
  } else if (recognizer.state == UIGestureRecognizerStateEnded && self.onZoomChanged) {
    self.onZoomChanged(@{ @"zoom": @(self.zoom) });
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
  }
}

@end
