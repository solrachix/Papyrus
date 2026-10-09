#import "PapyrusPdfDocumentView.h"

#import <QuartzCore/QuartzCore.h>
#import <PencilKit/PencilKit.h>
#import <dispatch/dispatch.h>
#import <math.h>

#import "PapyrusEngineStore.h"
#import "PapyrusPdfPageTheme.h"
#import "PapyrusPageRotationRegistry.h"

static const CGFloat PapyrusPdfMinimumZoom = 0.5;
static const CGFloat PapyrusPdfMaximumZoom = 4.0;
static const CGFloat PapyrusPdfZoomEventTolerance = 0.02;
static const NSTimeInterval PapyrusPdfZoomEventInterval = 0.10;
static const NSTimeInterval PapyrusPdfScrollEventInterval = 0.08;
static void *PapyrusPdfScrollObservationContext = &PapyrusPdfScrollObservationContext;

static void PapyrusInvalidateViewTree(UIView *view) {
  [view setNeedsDisplay];
  [view.layer setNeedsDisplay];
  for (UIView *subview in view.subviews) {
    PapyrusInvalidateViewTree(subview);
  }
}

static UIColor *PapyrusPageThemeCanvasColor(NSString *theme) {
  if ([theme isEqualToString:@"sepia"]) {
    return [UIColor colorWithRed:0.96 green:0.92 blue:0.83 alpha:1.0];
  }
  if ([theme isEqualToString:@"dark"]) {
    return [UIColor colorWithWhite:0.08 alpha:1.0];
  }
  if ([theme isEqualToString:@"high-contrast"]) {
    return UIColor.blackColor;
  }
  return UIColor.whiteColor;
}

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

static CGRect PapyrusPdfRectFromNormalizedRect(NSDictionary *normalizedRect, CGRect pageBounds) {
  if (![normalizedRect isKindOfClass:NSDictionary.class] ||
      CGRectIsNull(pageBounds) || CGRectIsEmpty(pageBounds)) {
    return CGRectNull;
  }

  id xValue = normalizedRect[@"x"];
  id yValue = normalizedRect[@"y"];
  id widthValue = normalizedRect[@"width"];
  id heightValue = normalizedRect[@"height"];
  if (![xValue respondsToSelector:@selector(doubleValue)] ||
      ![yValue respondsToSelector:@selector(doubleValue)] ||
      ![widthValue respondsToSelector:@selector(doubleValue)] ||
      ![heightValue respondsToSelector:@selector(doubleValue)]) {
    return CGRectNull;
  }

  CGFloat x = [xValue doubleValue];
  CGFloat y = [yValue doubleValue];
  CGFloat width = [widthValue doubleValue];
  CGFloat height = [heightValue doubleValue];
  if (!isfinite(x) || !isfinite(y) || !isfinite(width) || !isfinite(height) ||
      width <= 0 || height <= 0) {
    return CGRectNull;
  }

  CGFloat normalizedX = MIN(1.0, MAX(0.0, x));
  CGFloat normalizedY = MIN(1.0, MAX(0.0, y));
  CGFloat normalizedRight = MIN(1.0, MAX(normalizedX, x + width));
  CGFloat normalizedBottom = MIN(1.0, MAX(normalizedY, y + height));
  CGFloat normalizedWidth = normalizedRight - normalizedX;
  CGFloat normalizedHeight = normalizedBottom - normalizedY;
  if (normalizedWidth <= 0 || normalizedHeight <= 0) return CGRectNull;

  return CGRectMake(
      CGRectGetMinX(pageBounds) + normalizedX * CGRectGetWidth(pageBounds),
      CGRectGetMinY(pageBounds) +
          (1.0 - normalizedY - normalizedHeight) * CGRectGetHeight(pageBounds),
      normalizedWidth * CGRectGetWidth(pageBounds),
      normalizedHeight * CGRectGetHeight(pageBounds));
}

static UIColor *PapyrusAnnotationColor(NSString *hexColor, CGFloat opacity) {
  NSString *source = [hexColor isKindOfClass:NSString.class] ? hexColor : @"#fbbf24";
  NSString *hex = [[source stringByTrimmingCharactersInSet:
      NSCharacterSet.whitespaceAndNewlineCharacterSet] uppercaseString];
  if ([hex hasPrefix:@"#"]) hex = [hex substringFromIndex:1];
  if (hex.length == 3) {
    NSMutableString *expanded = [NSMutableString string];
    for (NSUInteger index = 0; index < hex.length; index += 1) {
      unichar digit = [hex characterAtIndex:index];
      [expanded appendFormat:@"%C%C", digit, digit];
    }
    hex = expanded;
  }

  unsigned int rgb = 0;
  NSScanner *scanner = [NSScanner scannerWithString:hex];
  UIColor *baseColor = [scanner scanHexInt:&rgb] && scanner.isAtEnd && hex.length == 6
      ? [UIColor colorWithRed:((rgb >> 16) & 0xff) / 255.0
                        green:((rgb >> 8) & 0xff) / 255.0
                         blue:(rgb & 0xff) / 255.0
                        alpha:1.0]
      : [UIColor colorWithRed:1.0 green:0.75 blue:0.1 alpha:1.0];
  return [baseColor colorWithAlphaComponent:MIN(1.0, MAX(0.0, opacity))];
}

static NSMapTable<UIWindow *, PKToolPicker *> *PapyrusToolPickersByWindow(void) {
  static NSMapTable<UIWindow *, PKToolPicker *> *pickers;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    pickers = [NSMapTable weakToStrongObjectsMapTable];
  });
  return pickers;
}

static NSString *PapyrusHexColorFromUIColor(UIColor *color, CGFloat *opacity) {
  CGFloat red = 0;
  CGFloat green = 0;
  CGFloat blue = 0;
  CGFloat alpha = 1;
  if (![color getRed:&red green:&green blue:&blue alpha:&alpha]) {
    CGColorRef cgColor = color.CGColor;
    const CGFloat *components = CGColorGetComponents(cgColor);
    size_t componentCount = CGColorGetNumberOfComponents(cgColor);
    CGColorSpaceModel model = CGColorSpaceGetModel(CGColorGetColorSpace(cgColor));
    if (components && model == kCGColorSpaceModelMonochrome && componentCount >= 2) {
      red = green = blue = components[0];
      alpha = components[1];
    } else if (components && componentCount >= 4) {
      red = components[0];
      green = components[1];
      blue = components[2];
      alpha = components[3];
    }
  }
  if (opacity) *opacity = MIN(1.0, MAX(0.0, alpha));
  return [NSString stringWithFormat:@"#%02X%02X%02X",
          (unsigned int)lrint(MIN(1.0, MAX(0.0, red)) * 255.0),
          (unsigned int)lrint(MIN(1.0, MAX(0.0, green)) * 255.0),
          (unsigned int)lrint(MIN(1.0, MAX(0.0, blue)) * 255.0)];
}

@interface PapyrusPdfPageInkCanvasView : PKCanvasView
@property (nonatomic, assign) NSInteger papyrusPageIndex;
@property (nonatomic, assign) BOOL applyingStoreDrawing;
@property (nonatomic, assign) BOOL hasUncommittedChanges;
@property (nonatomic, assign) NSUInteger pendingCommitGeneration;
@property (nonatomic, copy) NSString *appliedStoreSignature;
@property (nonatomic, weak) PKToolPicker *observedToolPicker;
@end

@implementation PapyrusPdfPageInkCanvasView
@end

@interface PapyrusSquigglyPdfAnnotation : PDFAnnotation
@end

@implementation PapyrusSquigglyPdfAnnotation
- (void)drawWithBox:(PDFDisplayBox)box inContext:(CGContextRef)context {
  (void)box;
  CGRect bounds = self.bounds;
  if (CGRectIsNull(bounds) || CGRectIsEmpty(bounds) || !context) return;

  CGFloat height = CGRectGetHeight(bounds);
  CGFloat wavelength = MAX(2.0, height * 0.7);
  CGFloat amplitude = MAX(0.6, height * 0.16);
  CGFloat centerY = CGRectGetMidY(bounds);
  CGContextSaveGState(context);
  CGContextSetStrokeColorWithColor(context, self.color.CGColor);
  CGContextSetLineWidth(context, MAX(0.65, height * 0.08));
  CGMutablePathRef path = CGPathCreateMutable();
  CGFloat minX = CGRectGetMinX(bounds);
  CGFloat maxX = CGRectGetMaxX(bounds);
  BOOL first = YES;
  for (CGFloat x = minX; x <= maxX; x += 1.5) {
    CGFloat y = centerY + sin((x - minX) * M_PI * 2.0 / wavelength) * amplitude;
    if (first) {
      CGPathMoveToPoint(path, NULL, x, y);
      first = NO;
    } else {
      CGPathAddLineToPoint(path, NULL, x, y);
    }
  }
  CGPathAddLineToPoint(path, NULL, maxX, centerY);
  CGContextAddPath(context, path);
  CGContextStrokePath(context);
  CGPathRelease(path);
  CGContextRestoreGState(context);
}
@end

@interface PapyrusCommentPdfAnnotation : PDFAnnotation
@property (nonatomic, assign) BOOL groupHidden;
@property (nonatomic, assign) NSInteger groupCount;
@end

@implementation PapyrusCommentPdfAnnotation
- (void)drawWithBox:(PDFDisplayBox)box inContext:(CGContextRef)context {
  (void)box;
  if (self.groupHidden) return;
  CGRect bounds = self.bounds;
  if (CGRectIsNull(bounds) || CGRectIsEmpty(bounds) || !context) return;

  CGFloat inset = MAX(1.0, CGRectGetHeight(bounds) * 0.08);
  CGRect noteRect = CGRectInset(bounds, inset, inset);
  CGFloat fold = MIN(CGRectGetWidth(noteRect), CGRectGetHeight(noteRect)) * 0.24;
  CGFloat radius = MIN(CGRectGetHeight(noteRect) * 0.12, 4.0);
  CGPathRef notePath = CGPathCreateWithRoundedRect(noteRect, radius, radius, NULL);
  CGContextSaveGState(context);
  CGContextAddPath(context, notePath);
  CGContextSetFillColorWithColor(context, self.color.CGColor);
  CGContextFillPath(context);
  CGPathRelease(notePath);

  CGContextSetStrokeColorWithColor(context, UIColor.whiteColor.CGColor);
  CGContextSetLineWidth(context, MAX(0.7, CGRectGetHeight(noteRect) * 0.045));
  CGFloat left = CGRectGetMinX(noteRect) + inset;
  CGFloat right = CGRectGetMaxX(noteRect) - fold - inset;
  CGFloat firstY = CGRectGetMinY(noteRect) + CGRectGetHeight(noteRect) * 0.38;
  CGFloat secondY = CGRectGetMinY(noteRect) + CGRectGetHeight(noteRect) * 0.62;
  CGContextMoveToPoint(context, left, firstY);
  CGContextAddLineToPoint(context, right, firstY);
  CGContextMoveToPoint(context, left, secondY);
  CGContextAddLineToPoint(context, right, secondY);
  CGContextStrokePath(context);
  if (self.groupCount > 1) {
    UIGraphicsPushContext(context);
    CGContextTranslateCTM(context, CGRectGetMidX(bounds), CGRectGetMidY(bounds));
    CGContextScaleCTM(context, 1, -1);
    NSString *label = [NSString stringWithFormat:@"%ld", (long)self.groupCount];
    NSDictionary *attributes = @{NSFontAttributeName:[UIFont boldSystemFontOfSize:MAX(8, bounds.size.height * 0.6)], NSForegroundColorAttributeName:UIColor.whiteColor};
    CGSize size = [label sizeWithAttributes:attributes];
    [label drawAtPoint:CGPointMake(-size.width/2, -size.height/2) withAttributes:attributes];
    UIGraphicsPopContext();
  }
  CGContextRestoreGState(context);
}
@end

@interface PapyrusSelectionOutlinePdfAnnotation : PDFAnnotation
@end

@implementation PapyrusSelectionOutlinePdfAnnotation
- (void)drawWithBox:(PDFDisplayBox)box inContext:(CGContextRef)context {
  (void)box;
  CGRect bounds = self.bounds;
  if (CGRectIsNull(bounds) || CGRectIsEmpty(bounds) || !context) return;

  CGFloat lineWidth = 1.5;
  CGRect outline = CGRectInset(bounds, lineWidth / 2.0, lineWidth / 2.0);
  if (CGRectIsNull(outline) || CGRectIsEmpty(outline)) return;
  CGContextSaveGState(context);
  CGContextSetStrokeColorWithColor(context, self.color.CGColor);
  CGContextSetLineWidth(context, lineWidth);
  CGContextStrokeRect(context, outline);
  CGContextRestoreGState(context);
}
@end

@interface PapyrusPdfDocumentView () <UIEditMenuInteractionDelegate,
                                      PDFPageOverlayViewProvider,
                                      PKCanvasViewDelegate,
                                      PKToolPickerObserver>
@property (nonatomic, strong) PDFView *pdfView;
@property (nonatomic, copy, nullable) NSString *pageThemeLeaseToken;
@property (nonatomic, strong) UIEditMenuInteraction *editMenuInteraction;
@property (nonatomic, copy) NSArray<PDFSelection *> *searchSelections;
@property (nonatomic, copy) NSDictionary<NSNumber *, PDFSelection *> *searchSelectionsByResultIndex;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray<PDFAnnotation *> *> *papyrusAnnotationsById;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSString *> *papyrusAnnotationSignaturesById;
@property (nonatomic, strong) NSMapTable<PDFAnnotation *, NSString *> *papyrusAnnotationIdsByObject;
@property (nonatomic, copy) NSArray<PDFAnnotation *> *selectedAnnotationAdornmentAnnotations;
@property (nonatomic, copy, nullable) NSString *contextualAnnotationMenuId;
@property (nonatomic, copy, nullable) NSString *contextualAnnotationMenuConfigurationId;
@property (nonatomic, assign) CGPoint contextualAnnotationMenuSourcePoint;
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
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, PapyrusPdfPageInkCanvasView *> *inkCanvasesByPageIndex;
@property (nonatomic, strong) NSMutableDictionary<NSNumber *, NSString *> *inkAnnotationSignaturesByPageIndex;
@property (nonatomic, weak) PapyrusPdfPageInkCanvasView *activeInkCanvas;
@property (nonatomic, strong) PKToolPicker *activeInkToolPicker;
@property (nonatomic, copy) NSString *lastAppliedInkToolConfiguration;
- (void)scheduleSelectionEditMenuForSignature:(NSString *)signature;
- (void)attemptSelectionEditMenuForSignature:(NSString *)signature generation:(NSUInteger)generation;
- (BOOL)hasActiveGestureInView:(UIView *)view;
- (void)emitDefineSelection;
- (BOOL)isSingleWordSelection:(NSString *)text;
- (void)rebuildSearchHighlights;
- (void)updateSearchHighlightColorsFromResultIndex:(NSInteger)previousSearchIndex;
- (void)scheduleNavigationToSearchResultAtIndex:(NSInteger)activeSearchIndex;
- (UIColor *)searchHighlightColorForActive:(BOOL)isActive;
- (void)reconcilePapyrusAnnotations;
- (void)updateSelectedAnnotationAdornment;
- (void)removeSelectedAnnotationAdornment;
- (void)dismissAnnotationMenuForDocumentChange;
- (void)removePapyrusAnnotationWithId:(NSString *)annotationId;
- (void)clearPapyrusAnnotationsForDocument:(nullable PDFDocument *)document;
- (NSArray<PDFAnnotation *> *)createPdfAnnotationsForPapyrusAnnotation:(NSDictionary *)annotation;
- (NSString *)annotationSignature:(NSDictionary *)annotation;
- (void)emitAnnotationFromCurrentSelectionWithType:(NSString *)type;
- (void)presentAnnotationEditMenuForId:(NSString *)annotationId atPoint:(CGPoint)point;
- (void)emitAnnotationDeleteWithId:(NSString *)annotationId;
- (void)emitCommentAtPage:(PDFPage *)page pageIndex:(NSInteger)pageIndex normalizedPoint:(CGPoint)point;
- (void)reconcileInkOverlays;
- (void)applyStoreInkAnnotationsToCanvas:(PapyrusPdfPageInkCanvasView *)canvas force:(BOOL)force;
- (void)updateInkCanvasInputAndPicker;
- (void)activateInkCanvas:(PapyrusPdfPageInkCanvasView *)canvas;
- (void)deactivateInkCanvas;
- (void)releaseInkCanvas:(PapyrusPdfPageInkCanvasView *)canvas;
- (void)commitInkDrawingForCanvas:(PapyrusPdfPageInkCanvasView *)canvas;
- (NSString *)inkAnnotationSignatureForPage:(NSInteger)pageIndex;
- (NSArray<NSDictionary *> *)inkDrawingPayloadForCanvas:(PapyrusPdfPageInkCanvasView *)canvas;
- (void)resetInkOverlaysForDocumentChange;
- (void)releasePageThemeLeaseForDocument:(nullable PDFDocument *)document;
- (void)acquireOrUpdatePageThemeLeaseForDocument:(nullable PDFDocument *)document;
@end

@implementation PapyrusPdfDocumentView

- (void)dealloc {
  [self releasePageThemeLeaseForDocument:self.pdfView.document];
  [self stopObservingScrollView];
  [self resetInkOverlaysForDocumentChange];
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  self.tapRecognizer.delegate = nil;
  self.doubleTapRecognizer.delegate = nil;
  [self clearPapyrusAnnotationsForDocument:self.pdfView.document];
}

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
  _annotations = @[];
  _activeTool = @"select";
  _activeDrawToolPreset = @"ink";
  _inkStrokeWidth = 0.006;
  _annotationColor = @"#fbbf24";
  _annotationSelectionColor = @"#2563eb";
  _annotationOpacity = 1.0;
  _papyrusAnnotationsById = [NSMutableDictionary dictionary];
  _papyrusAnnotationSignaturesById = [NSMutableDictionary dictionary];
  _papyrusAnnotationIdsByObject = [NSMapTable strongToStrongObjectsMapTable];
  _selectedAnnotationAdornmentAnnotations = @[];
  _inkCanvasesByPageIndex = [NSMutableDictionary dictionary];
  _inkAnnotationSignaturesByPageIndex = [NSMutableDictionary dictionary];
  _searchNavigationGeneration = 0;
  _lastEmittedPage = NSNotFound;
  _lastSelectionPageIndex = NSNotFound;
  _lastEmittedZoom = NAN;
  _lastLayoutSize = CGSizeZero;
  _defineLabel = NSLocalizedString(@"Define", nil);
  _annotateLabel = NSLocalizedString(@"Annotate", nil);
  _annotationHighlightLabel = NSLocalizedString(@"Highlight", nil);
  _annotationUnderlineLabel = NSLocalizedString(@"Underline", nil);
  _annotationStrikeoutLabel = NSLocalizedString(@"Strikeout", nil);
  _annotationSquigglyLabel = NSLocalizedString(@"Squiggly", nil);
  _annotationNoteLabel = NSLocalizedString(@"Note", nil);
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
    _pdfView.pageOverlayViewProvider = self;
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
  NSSet<NSString *> *supportedThemes =
      [NSSet setWithArray:@[@"normal", @"sepia", @"dark", @"high-contrast"]];
  NSString *normalizedTheme = pageTheme.length > 0 &&
                                      [supportedThemes containsObject:pageTheme]
      ? [pageTheme copy]
      : @"normal";
  BOOL didChange = ![_pageTheme isEqualToString:normalizedTheme];
  _pageTheme = normalizedTheme;
  if (self.window) {
    [self acquireOrUpdatePageThemeLeaseForDocument:self.pdfView.document];
  } else {
    [self releasePageThemeLeaseForDocument:self.pdfView.document];
  }

  UIColor *canvasColor = PapyrusPageThemeCanvasColor(normalizedTheme);
  self.backgroundColor = canvasColor;
  self.pdfView.backgroundColor = canvasColor;
  if (didChange) {
    PapyrusInvalidateViewTree(self.pdfView);
  }
}

- (void)releasePageThemeLeaseForDocument:(PDFDocument *)document {
  if (document && self.pageThemeLeaseToken.length > 0) {
    PapyrusReleasePdfPageThemeLease(document, self.pageThemeLeaseToken);
  }
  self.pageThemeLeaseToken = nil;
}

- (void)acquireOrUpdatePageThemeLeaseForDocument:(PDFDocument *)document {
  if (!document) return;
  if (self.pageThemeLeaseToken.length > 0) {
    PapyrusUpdatePdfPageThemeLease(document, self.pageThemeLeaseToken, self.pageTheme);
  } else {
    self.pageThemeLeaseToken =
        PapyrusAcquirePdfPageThemeLease(document, self.pageTheme);
  }
}

- (void)setActiveTool:(NSString *)activeTool {
  _activeTool = activeTool.length > 0 ? [activeTool copy] : @"select";
  [self updateInkCanvasInputAndPicker];
}

- (void)setActiveDrawToolPreset:(NSString *)activeDrawToolPreset {
  NSSet<NSString *> *presets = [NSSet setWithArray:@[@"ink", @"highlight", @"underline"]];
  _activeDrawToolPreset = [presets containsObject:activeDrawToolPreset]
      ? [activeDrawToolPreset copy] : @"ink";
  self.lastAppliedInkToolConfiguration = nil;
  [self updateInkCanvasInputAndPicker];
}

- (void)setInkStrokeWidth:(CGFloat)inkStrokeWidth {
  if (!isfinite(inkStrokeWidth)) return;
  _inkStrokeWidth = MIN(0.02, MAX(0.0025, inkStrokeWidth));
  self.lastAppliedInkToolConfiguration = nil;
  [self updateInkCanvasInputAndPicker];
}

- (void)setAnnotationColor:(NSString *)annotationColor {
  _annotationColor = annotationColor.length > 0 ? [annotationColor copy] : @"#fbbf24";
  self.lastAppliedInkToolConfiguration = nil;
  [self updateInkCanvasInputAndPicker];
}

- (void)setAnnotationOpacity:(CGFloat)annotationOpacity {
  if (!isfinite(annotationOpacity)) return;
  _annotationOpacity = MIN(1.0, MAX(0.1, annotationOpacity));
  self.lastAppliedInkToolConfiguration = nil;
  [self updateInkCanvasInputAndPicker];
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
  PDFDocument *currentDocument = self.pdfView.document;
  PapyrusPageRotationRegistry *rotationRegistry =
      [PapyrusPageRotationRegistry sharedRegistry];
  if (currentDocument) {
    [rotationRegistry restoreAllRotationsForDocument:currentDocument];
  }
  if (document && document != currentDocument) {
    [rotationRegistry restoreAllRotationsForDocument:document];
  }
  if (self.pdfView.document == document) {
    if (self.window) {
      [self acquireOrUpdatePageThemeLeaseForDocument:document];
    } else {
      [self releasePageThemeLeaseForDocument:document];
    }
    [self applyCurrentPage];
    [self rebuildSearchHighlights];
    [self reconcilePapyrusAnnotations];
    [self reconcileInkOverlays];
    return;
  }

  [self dismissAnnotationMenuForDocumentChange];
  CGFloat desiredZoom = [self clampedZoom:self.zoom];
  BOOL wasSuppressingScaleSynchronization = self.suppressScaleSynchronization;
  self.suppressScaleSynchronization = YES;
  self.lastVisiblePagesSignature = nil;
  self.lastEmittedPage = NSNotFound;
  [self resetInkOverlaysForDocumentChange];
  [self clearPapyrusAnnotationsForDocument:self.pdfView.document];
  [self clearCurrentSelection];
  [self releasePageThemeLeaseForDocument:currentDocument];
  if (document && self.window) {
    self.pageThemeLeaseToken =
        PapyrusAcquirePdfPageThemeLease(document, self.pageTheme);
  }
  self.pdfView.document = document;
  if (!document) {
    [self rebuildSearchHighlights];
    [self reconcilePapyrusAnnotations];
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
  [self reconcilePapyrusAnnotations];
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

- (void)setAnnotations:(NSArray<NSDictionary *> *)annotations {
  _annotations = [annotations copy] ?: @[];
  [self reconcilePapyrusAnnotations];
  [self reconcileInkOverlays];
}

- (UIView *)pdfView:(PDFView *)pdfView overlayViewForPage:(PDFPage *)page {
  if (@available(iOS 16.0, *)) {
    PDFDocument *document = pdfView.document;
    NSInteger pageIndex = document ? (NSInteger)[document indexForPage:page] : NSNotFound;
    if (pageIndex < 0 || pageIndex == NSNotFound) return nil;

    NSNumber *key = @(pageIndex);
    PapyrusPdfPageInkCanvasView *canvas = self.inkCanvasesByPageIndex[key];
    if (!canvas) {
      canvas = [[PapyrusPdfPageInkCanvasView alloc] initWithFrame:CGRectZero];
      canvas.papyrusPageIndex = pageIndex;
      canvas.backgroundColor = UIColor.clearColor;
      canvas.opaque = NO;
      canvas.clipsToBounds = YES;
      canvas.drawingPolicy = PKCanvasViewDrawingPolicyAnyInput;
      canvas.scrollEnabled = NO;
      canvas.delegate = self;
      canvas.userInteractionEnabled = NO;
      self.inkCanvasesByPageIndex[key] = canvas;
      [self applyStoreInkAnnotationsToCanvas:canvas force:YES];
    }
    return canvas;
  }
  return nil;
}

- (void)pdfView:(PDFView *)pdfView
    willDisplayOverlayView:(UIView *)overlayView
                 forPage:(PDFPage *)page {
  (void)page;
  if (![overlayView isKindOfClass:PapyrusPdfPageInkCanvasView.class]) return;
  UIView *ancestor = overlayView.superview;
  while (ancestor && ancestor != pdfView) {
    ancestor.userInteractionEnabled = YES;
    ancestor = ancestor.superview;
  }
  PapyrusPdfPageInkCanvasView *canvas = (PapyrusPdfPageInkCanvasView *)overlayView;
  self.inkCanvasesByPageIndex[@(canvas.papyrusPageIndex)] = canvas;
  [self applyStoreInkAnnotationsToCanvas:canvas force:NO];
  [self updateInkCanvasInputAndPicker];
}

- (void)pdfView:(PDFView *)pdfView
    willEndDisplayingOverlayView:(UIView *)overlayView
                        forPage:(PDFPage *)page {
  (void)pdfView;
  (void)page;
  if ([overlayView isKindOfClass:PapyrusPdfPageInkCanvasView.class]) {
    [self releaseInkCanvas:(PapyrusPdfPageInkCanvasView *)overlayView];
  }
}

- (NSString *)inkAnnotationSignatureForPage:(NSInteger)pageIndex {
  NSMutableArray<NSDictionary *> *pageAnnotations = [NSMutableArray array];
  for (id value in self.annotations) {
    if (![value isKindOfClass:NSDictionary.class]) continue;
    NSDictionary *annotation = (NSDictionary *)value;
    if (![annotation[@"type"] isEqual:@"ink"] ||
        [annotation[@"pageIndex"] integerValue] != pageIndex) {
      continue;
    }
    [pageAnnotations addObject:@{
      @"path" : annotation[@"path"] ?: @[],
      @"color" : annotation[@"color"] ?: @"#111827",
      @"opacity" : annotation[@"opacity"] ?: @1,
      @"strokeWidth" : annotation[@"strokeWidth"] ?: @0.006
    }];
  }

  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:pageAnnotations
                                                  options:NSJSONWritingSortedKeys
                                                    error:&error];
  if (!data || error) return pageAnnotations.description ?: @"[]";
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"[]";
}

- (void)applyStoreInkAnnotationsToCanvas:(PapyrusPdfPageInkCanvasView *)canvas
                                   force:(BOOL)force {
  if (!canvas || !self.pdfView.document) return;
  NSInteger pageIndex = canvas.papyrusPageIndex;
  NSString *signature = [self inkAnnotationSignatureForPage:pageIndex];
  if (!force && [canvas.appliedStoreSignature isEqualToString:signature]) return;

  CGFloat canvasWidth = CGRectGetWidth(canvas.bounds);
  CGFloat canvasHeight = CGRectGetHeight(canvas.bounds);
  PDFPage *page = [self.pdfView.document pageAtIndex:(NSUInteger)pageIndex];
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (canvasWidth <= 0) canvasWidth = CGRectGetWidth(pageBounds);
  if (canvasHeight <= 0) canvasHeight = CGRectGetHeight(pageBounds);
  if (canvasWidth <= 0 || canvasHeight <= 0) return;

  NSMutableArray<PKStroke *> *strokes = [NSMutableArray array];
  for (id value in self.annotations) {
    if (![value isKindOfClass:NSDictionary.class]) continue;
    NSDictionary *annotation = (NSDictionary *)value;
    if (![annotation[@"type"] isEqual:@"ink"] ||
        [annotation[@"pageIndex"] integerValue] != pageIndex) {
      continue;
    }
    NSArray *pathValues = [annotation[@"path"] isKindOfClass:NSArray.class]
        ? annotation[@"path"] : @[];
    if (pathValues.count == 0) continue;

    CGFloat opacity = [annotation[@"opacity"] respondsToSelector:@selector(doubleValue)]
        ? [annotation[@"opacity"] doubleValue] : 1.0;
    opacity = isfinite(opacity) ? MIN(1.0, MAX(0.0, opacity)) : 1.0;
    NSString *hexColor = [annotation[@"color"] isKindOfClass:NSString.class]
        ? annotation[@"color"] : @"#111827";
    UIColor *color = PapyrusAnnotationColor(hexColor, opacity);
    PKInkType inkType = opacity <= 0.35 ? PKInkTypeMarker : PKInkTypePen;
    PKInk *ink = [[PKInk alloc] initWithInkType:inkType color:color];
    CGFloat normalizedWidth = [annotation[@"strokeWidth"] respondsToSelector:@selector(doubleValue)]
        ? [annotation[@"strokeWidth"] doubleValue] : 0.006;
    if (!isfinite(normalizedWidth) || normalizedWidth <= 0) normalizedWidth = 0.006;
    CGFloat pointWidth = MAX(0.6, normalizedWidth * canvasWidth);

    NSMutableArray<PKStrokePoint *> *controlPoints = [NSMutableArray array];
    for (id pointValue in pathValues) {
      if (![pointValue isKindOfClass:NSDictionary.class]) continue;
      NSDictionary *point = (NSDictionary *)pointValue;
      CGFloat x = [point[@"x"] respondsToSelector:@selector(doubleValue)]
          ? [point[@"x"] doubleValue] : NAN;
      CGFloat y = [point[@"y"] respondsToSelector:@selector(doubleValue)]
          ? [point[@"y"] doubleValue] : NAN;
      if (!isfinite(x) || !isfinite(y)) continue;
      CGPoint location = CGPointMake(
          MIN(1.0, MAX(0.0, x)) * canvasWidth,
          MIN(1.0, MAX(0.0, y)) * canvasHeight);
      NSTimeInterval timeOffset = (NSTimeInterval)controlPoints.count / 60.0;
      [controlPoints addObject:[[PKStrokePoint alloc]
          initWithLocation:location
                timeOffset:timeOffset
                      size:CGSizeMake(pointWidth, pointWidth)
                   opacity:1.0
                     force:1.0
                    azimuth:0.0
                  altitude:(CGFloat)M_PI_2]];
    }
    if (controlPoints.count == 0) continue;
    if (controlPoints.count == 1) {
      PKStrokePoint *firstPoint = controlPoints.firstObject;
      [controlPoints addObject:[[PKStrokePoint alloc]
          initWithLocation:firstPoint.location
                timeOffset:firstPoint.timeOffset + (1.0 / 60.0)
                      size:firstPoint.size
                   opacity:firstPoint.opacity
                     force:firstPoint.force
                    azimuth:firstPoint.azimuth
                  altitude:firstPoint.altitude]];
    }

    PKStrokePath *strokePath = [[PKStrokePath alloc]
        initWithControlPoints:controlPoints
                creationDate:NSDate.date];
    PKStroke *stroke = [[PKStroke alloc]
        initWithInk:ink
         strokePath:strokePath
          transform:CGAffineTransformIdentity
               mask:nil];
    [strokes addObject:stroke];
  }

  canvas.applyingStoreDrawing = YES;
  canvas.drawing = [[PKDrawing alloc] initWithStrokes:strokes];
  canvas.applyingStoreDrawing = NO;
  canvas.hasUncommittedChanges = NO;
  canvas.pendingCommitGeneration += 1;
  canvas.appliedStoreSignature = signature;
  self.inkAnnotationSignaturesByPageIndex[@(pageIndex)] = signature;
}

- (void)reconcileInkOverlays {
  for (NSNumber *pageKey in self.inkCanvasesByPageIndex.allKeys.copy) {
    PapyrusPdfPageInkCanvasView *canvas = self.inkCanvasesByPageIndex[pageKey];
    [self applyStoreInkAnnotationsToCanvas:canvas force:NO];
  }
}

- (void)updateInkCanvasInputAndPicker {
  BOOL drawingActive = [self.activeTool isEqualToString:@"ink"];
  for (PapyrusPdfPageInkCanvasView *canvas in self.inkCanvasesByPageIndex.allValues) {
    canvas.userInteractionEnabled = drawingActive;
  }
  if (!drawingActive) {
    if (self.activeInkCanvas.hasUncommittedChanges) {
      [self commitInkDrawingForCanvas:self.activeInkCanvas];
    }
    [self deactivateInkCanvas];
    return;
  }

  PDFPage *page = self.pdfView.currentPage;
  NSInteger pageIndex = page && self.pdfView.document
      ? (NSInteger)[self.pdfView.document indexForPage:page] : NSNotFound;
  PapyrusPdfPageInkCanvasView *canvas =
      pageIndex == NSNotFound ? nil : self.inkCanvasesByPageIndex[@(pageIndex)];
  if (!canvas) canvas = self.inkCanvasesByPageIndex.allValues.firstObject;
  if (canvas) [self activateInkCanvas:canvas];
}

- (void)activateInkCanvas:(PapyrusPdfPageInkCanvasView *)canvas {
  if (!canvas || !canvas.window || ![self.activeTool isEqualToString:@"ink"]) return;
  if (self.activeInkCanvas != canvas) [self deactivateInkCanvas];

  UIWindow *window = canvas.window;
  PKToolPicker *picker = [PapyrusToolPickersByWindow() objectForKey:window];
  if (!picker) {
    picker = [[PKToolPicker alloc] init];
    [PapyrusToolPickersByWindow() setObject:picker forKey:window];
  }
  for (PapyrusPdfPageInkCanvasView *visibleCanvas in self.inkCanvasesByPageIndex.allValues) {
    if (visibleCanvas.observedToolPicker == picker) continue;
    [visibleCanvas.observedToolPicker removeObserver:visibleCanvas];
    [picker addObserver:visibleCanvas];
    visibleCanvas.observedToolPicker = picker;
  }
  if (self.activeInkToolPicker != picker) [picker addObserver:self];
  self.activeInkToolPicker = picker;
  self.activeInkCanvas = canvas;
  canvas.delegate = self;
  canvas.userInteractionEnabled = YES;

  NSString *configuration = [NSString stringWithFormat:@"%@|%@|%.5f|%.5f",
      self.activeDrawToolPreset ?: @"ink",
      self.annotationColor ?: @"#111827",
      self.annotationOpacity,
      self.inkStrokeWidth];
  if (![self.lastAppliedInkToolConfiguration isEqualToString:configuration]) {
    PDFPage *page = [self.pdfView.document pageAtIndex:(NSUInteger)canvas.papyrusPageIndex];
    CGFloat pageWidth = CGRectGetWidth([page boundsForBox:kPDFDisplayBoxCropBox]);
    CGFloat toolWidth = MAX(0.6, self.inkStrokeWidth * pageWidth);
    PKInkType type = [self.activeDrawToolPreset isEqualToString:@"highlight"]
        ? PKInkTypeMarker : PKInkTypePen;
    picker.selectedTool = [[PKInkingTool alloc]
        initWithInkType:type
                  color:PapyrusAnnotationColor(self.annotationColor, self.annotationOpacity)
                  width:toolWidth];
    self.lastAppliedInkToolConfiguration = configuration;
  }

  [canvas becomeFirstResponder];
  if (@available(iOS 16.0, *)) {
    [picker setVisible:YES forFirstResponder:canvas];
  }
}

- (void)deactivateInkCanvas {
  PapyrusPdfPageInkCanvasView *canvas = self.activeInkCanvas;
  PKToolPicker *picker = self.activeInkToolPicker;
  for (PapyrusPdfPageInkCanvasView *visibleCanvas in self.inkCanvasesByPageIndex.allValues) {
    PKToolPicker *observedPicker = visibleCanvas.observedToolPicker;
    if (observedPicker) [observedPicker removeObserver:visibleCanvas];
    visibleCanvas.observedToolPicker = nil;
  }
  if (picker) {
    [picker removeObserver:self];
    if (canvas) {
      if (@available(iOS 16.0, *)) {
        [picker setVisible:NO forFirstResponder:canvas];
      }
      [canvas resignFirstResponder];
    }
  }
  canvas.userInteractionEnabled = NO;
  self.activeInkCanvas = nil;
  self.activeInkToolPicker = nil;
}

- (void)releaseInkCanvas:(PapyrusPdfPageInkCanvasView *)canvas {
  if (!canvas) return;
  if (canvas.hasUncommittedChanges) [self commitInkDrawingForCanvas:canvas];
  if (self.activeInkCanvas == canvas) [self deactivateInkCanvas];
  else if (canvas.observedToolPicker) {
    [canvas.observedToolPicker removeObserver:canvas];
    canvas.observedToolPicker = nil;
  }
  NSNumber *key = @(canvas.papyrusPageIndex);
  if (self.inkCanvasesByPageIndex[key] == canvas) {
    [self.inkCanvasesByPageIndex removeObjectForKey:key];
    [self.inkAnnotationSignaturesByPageIndex removeObjectForKey:key];
  }
  canvas.delegate = nil;
  canvas.userInteractionEnabled = NO;
}

- (void)canvasViewDrawingDidChange:(PKCanvasView *)canvasView {
  if (![canvasView isKindOfClass:PapyrusPdfPageInkCanvasView.class]) return;
  PapyrusPdfPageInkCanvasView *canvas = (PapyrusPdfPageInkCanvasView *)canvasView;
  if (canvas.applyingStoreDrawing || ![self.activeTool isEqualToString:@"ink"]) return;
  canvas.hasUncommittedChanges = YES;
  NSUInteger generation = ++canvas.pendingCommitGeneration;
  __weak typeof(self) weakSelf = self;
  __weak PapyrusPdfPageInkCanvasView *weakCanvas = canvas;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.40 * NSEC_PER_SEC)),
                 dispatch_get_main_queue(), ^{
    typeof(self) strongSelf = weakSelf;
    PapyrusPdfPageInkCanvasView *strongCanvas = weakCanvas;
    if (!strongSelf || !strongCanvas ||
        strongCanvas.pendingCommitGeneration != generation ||
        !strongCanvas.hasUncommittedChanges) return;
    UIGestureRecognizerState state = strongCanvas.drawingGestureRecognizer.state;
    if (state == UIGestureRecognizerStateBegan ||
        state == UIGestureRecognizerStateChanged) {
      [strongSelf canvasViewDrawingDidChange:strongCanvas];
      return;
    }
    [strongSelf commitInkDrawingForCanvas:strongCanvas];
  });
}

- (void)canvasViewDidEndUsingTool:(PKCanvasView *)canvasView {
  if ([canvasView isKindOfClass:PapyrusPdfPageInkCanvasView.class]) {
    [self commitInkDrawingForCanvas:(PapyrusPdfPageInkCanvasView *)canvasView];
  }
}

- (void)commitInkDrawingForCanvas:(PapyrusPdfPageInkCanvasView *)canvas {
  if (!canvas || !canvas.hasUncommittedChanges) return;
  canvas.pendingCommitGeneration += 1;
  canvas.hasUncommittedChanges = NO;
  NSArray<NSDictionary *> *strokes = [self inkDrawingPayloadForCanvas:canvas];
  canvas.appliedStoreSignature = nil;
  if (self.onInkDrawingCommitted) {
    self.onInkDrawingCommitted(@{
      @"pageIndex" : @(canvas.papyrusPageIndex),
      @"strokes" : strokes
    });
  }
}

- (NSArray<NSDictionary *> *)inkDrawingPayloadForCanvas:(PapyrusPdfPageInkCanvasView *)canvas {
  CGFloat width = CGRectGetWidth(canvas.bounds);
  CGFloat height = CGRectGetHeight(canvas.bounds);
  if (width <= 0 || height <= 0) return @[];

  NSMutableArray<NSDictionary *> *payload = [NSMutableArray array];
  for (PKStroke *stroke in canvas.drawing.strokes) {
    // The universal Papyrus path has no clipping mask. Use the vector eraser so
    // erased strokes disappear as complete paths instead of persisting masked ink.
    if (stroke.mask != nil) continue;
    PKStrokePath *path = stroke.path;
    NSMutableArray<NSDictionary *> *points = [NSMutableArray array];
    NSMutableArray<NSNumber *> *strokeWidthSamples = [NSMutableArray array];
    CGAffineTransform strokeTransform = stroke.transform;
    CGFloat transformDeterminant =
        strokeTransform.a * strokeTransform.d - strokeTransform.b * strokeTransform.c;
    CGFloat strokeWidthScale = sqrt(fabs(transformDeterminant));
    if (!isfinite(strokeWidthScale) || strokeWidthScale <= 0) strokeWidthScale = 1.0;
    for (NSUInteger index = 0; index < path.count; index += 1) {
      PKStrokePoint *strokePoint = [path pointAtIndex:index];
      CGPoint location = CGPointApplyAffineTransform(strokePoint.location, strokeTransform);
      CGFloat x = MIN(1.0, MAX(0.0, location.x / width));
      CGFloat y = MIN(1.0, MAX(0.0, location.y / height));
      if (!isfinite(x) || !isfinite(y)) continue;
      [points addObject:@{@"x" : @(x), @"y" : @(y)}];

      CGFloat pointWidth = strokePoint.size.width * strokeWidthScale;
      if (isfinite(pointWidth) && pointWidth > 0) {
        [strokeWidthSamples addObject:@(pointWidth)];
      }
    }
    if (points.count == 0) continue;
    if (points.count == 1) [points addObject:points.firstObject];

    CGFloat opacity = 1.0;
    NSString *color = PapyrusHexColorFromUIColor(stroke.ink.color, &opacity);
    if ([stroke.ink.inkType isEqualToString:PKInkTypeMarker]) {
      // The universal Papyrus ink contract uses opacity <= 0.35 to restore a marker.
      opacity = MIN(opacity, 0.28);
    }

    CGFloat representativeWidth = width * 0.006;
    if (strokeWidthSamples.count > 0) {
      NSArray<NSNumber *> *sortedWidthSamples =
          [strokeWidthSamples sortedArrayUsingSelector:@selector(compare:)];
      NSUInteger middleIndex = sortedWidthSamples.count / 2;
      if (sortedWidthSamples.count % 2 == 0) {
        representativeWidth =
            (sortedWidthSamples[middleIndex - 1].doubleValue +
             sortedWidthSamples[middleIndex].doubleValue) / 2.0;
      } else {
        representativeWidth = sortedWidthSamples[middleIndex].doubleValue;
      }
    }

    CGFloat normalizedWidth = representativeWidth / width;
    if (!isfinite(normalizedWidth) || normalizedWidth <= 0) normalizedWidth = 0.006;
    [payload addObject:@{
      @"path" : points,
      @"color" : color ?: @"#111827",
      @"opacity" : @(opacity),
      @"strokeWidth" : @(normalizedWidth)
    }];
  }
  return [payload copy];
}

- (void)toolPickerSelectedToolDidChange:(PKToolPicker *)toolPicker {
  PKTool *selectedTool = toolPicker.selectedTool;
  if (![selectedTool isKindOfClass:PKEraserTool.class]) return;
  PKEraserTool *eraser = (PKEraserTool *)selectedTool;
  if (eraser.eraserType == PKEraserTypeVector) return;
  // Papyrus stores normalized centerlines rather than PencilKit masks, so keep
  // erasing stroke-based and representable by the shared Annotation model.
  toolPicker.selectedTool = [[PKEraserTool alloc] initWithEraserType:PKEraserTypeVector];
}

- (void)toolPickerVisibilityDidChange:(PKToolPicker *)toolPicker {
  if (toolPicker != self.activeInkToolPicker) return;
  if (self.onInkToolPickerVisibilityChange) {
    self.onInkToolPickerVisibilityChange(@{@"visible" : @(toolPicker.isVisible)});
  }
}

- (void)resetInkOverlaysForDocumentChange {
  [self deactivateInkCanvas];
  for (PapyrusPdfPageInkCanvasView *canvas in self.inkCanvasesByPageIndex.allValues) {
    canvas.delegate = nil;
    canvas.userInteractionEnabled = NO;
  }
  [self.inkCanvasesByPageIndex removeAllObjects];
  [self.inkAnnotationSignaturesByPageIndex removeAllObjects];
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  if (!self.window) {
    [self releasePageThemeLeaseForDocument:self.pdfView.document];
    PapyrusInvalidateViewTree(self.pdfView);
    [self deactivateInkCanvas];
    for (PapyrusPdfPageInkCanvasView *canvas in self.inkCanvasesByPageIndex.allValues) {
      canvas.userInteractionEnabled = NO;
    }
    return;
  }
  [self acquireOrUpdatePageThemeLeaseForDocument:self.pdfView.document];
  PapyrusInvalidateViewTree(self.pdfView);
  [self updateInkCanvasInputAndPicker];
}

- (void)setAnnotationSelectionColor:(NSString *)annotationSelectionColor {
  NSString *normalized = annotationSelectionColor.length > 0
      ? [annotationSelectionColor copy] : @"#2563eb";
  if ([_annotationSelectionColor isEqualToString:normalized]) return;
  _annotationSelectionColor = normalized;
  [self updateSelectedAnnotationAdornment];
}

- (void)setAnnotationNavigationRequest:(NSDictionary *)request {
  _annotationNavigationRequest = [request copy];
  if (!request) return;
  PDFDocument *document = self.pdfView.document;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self.pdfView.document != document || ![self.annotationNavigationRequest isEqual:request]) return;
    NSInteger index = [request[@"pageIndex"] integerValue];
    if (index < 0 || index >= document.pageCount || ![request[@"rect"] isKindOfClass:[NSDictionary class]]) return;
    PDFPage *page = [document pageAtIndex:index];
    CGRect rect = PapyrusPdfRectFromNormalizedRect(request[@"rect"], [page boundsForBox:kPDFDisplayBoxCropBox]);
    if (!CGRectIsEmpty(rect)) [self.pdfView goToRect:rect onPage:page];
  });
}

- (void)setSelectedAnnotationId:(NSString *)selectedAnnotationId {
  NSString *normalized = selectedAnnotationId.length > 0
      ? [selectedAnnotationId copy] : nil;
  if ((_selectedAnnotationId == normalized) ||
      [_selectedAnnotationId isEqualToString:normalized]) return;
  _selectedAnnotationId = normalized;
  [self updateSelectedAnnotationAdornment];
}

- (NSString *)annotationSignature:(NSDictionary *)annotation {
  NSArray<NSString *> *signatureKeys = @[
    @"id", @"type", @"pageIndex", @"rect", @"rects", @"color", @"opacity", @"content", @"anchor", @"markupStyle", @"noteContent"
  ];
  NSMutableDictionary *signatureFields = [NSMutableDictionary dictionary];
  for (NSString *key in signatureKeys) {
    id value = annotation[key];
    if (value) signatureFields[key] = value;
  }
  if (![NSJSONSerialization isValidJSONObject:signatureFields]) {
    return signatureFields.description ?: @"";
  }
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:signatureFields
                                                options:NSJSONWritingSortedKeys
                                                  error:&error];
  if (!data || error) return annotation.description ?: @"";
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
}

- (void)removePapyrusAnnotationWithId:(NSString *)annotationId {
  NSArray<PDFAnnotation *> *representations = self.papyrusAnnotationsById[annotationId] ?: @[];
  for (PDFAnnotation *annotation in representations) {
    NSString *registeredId = [self.papyrusAnnotationIdsByObject objectForKey:annotation];
    if (![registeredId isEqualToString:annotationId]) continue;
    PDFPage *page = annotation.page;
    if (page) [page removeAnnotation:annotation];
    [self.papyrusAnnotationIdsByObject removeObjectForKey:annotation];
  }
  [self.papyrusAnnotationsById removeObjectForKey:annotationId];
  [self.papyrusAnnotationSignaturesById removeObjectForKey:annotationId];
}

- (void)clearPapyrusAnnotationsForDocument:(PDFDocument *)document {
  (void)document;
  [self removeSelectedAnnotationAdornment];
  NSArray<NSString *> *annotationIds = self.papyrusAnnotationsById.allKeys.copy;
  for (NSString *annotationId in annotationIds) {
    NSArray<PDFAnnotation *> *representations = self.papyrusAnnotationsById[annotationId] ?: @[];
    for (PDFAnnotation *annotation in representations) {
      NSString *registeredId = [self.papyrusAnnotationIdsByObject objectForKey:annotation];
      if ([registeredId isEqualToString:annotationId] && annotation.page) {
        [annotation.page removeAnnotation:annotation];
      }
      [self.papyrusAnnotationIdsByObject removeObjectForKey:annotation];
    }
  }
  [self.papyrusAnnotationsById removeAllObjects];
  [self.papyrusAnnotationSignaturesById removeAllObjects];
  [self.papyrusAnnotationIdsByObject removeAllObjects];
}

- (void)removeSelectedAnnotationAdornment {
  for (PDFAnnotation *annotation in self.selectedAnnotationAdornmentAnnotations ?: @[]) {
    PDFPage *page = annotation.page;
    if (page) [page removeAnnotation:annotation];
  }
  self.selectedAnnotationAdornmentAnnotations = @[];
}

- (void)updateSelectedAnnotationAdornment {
  [self removeSelectedAnnotationAdornment];
  NSString *annotationId = self.selectedAnnotationId;
  NSArray<PDFAnnotation *> *representations = annotationId.length > 0
      ? self.papyrusAnnotationsById[annotationId] : @[];
  if (representations.count == 0) {
    [self.pdfView setNeedsDisplay];
    return;
  }

  UIColor *selectionColor = PapyrusAnnotationColor(self.annotationSelectionColor, 1.0);
  NSMutableArray<PDFAnnotation *> *adornments = [NSMutableArray array];
  for (PDFAnnotation *representation in representations) {
    PDFPage *page = representation.page;
    CGRect bounds = representation.bounds;
    if (!page || CGRectIsNull(bounds) || CGRectIsEmpty(bounds)) continue;

    PDFAnnotation *adornment = [[PapyrusSelectionOutlinePdfAnnotation alloc]
        initWithBounds:bounds forType:@"Stamp" withProperties:nil];
    adornment.color = selectionColor;
    adornment.shouldDisplay = YES;
    [page addAnnotation:adornment];
    [adornments addObject:adornment];
  }
  self.selectedAnnotationAdornmentAnnotations = [adornments copy];
  [self.pdfView setNeedsDisplay];
}

- (NSArray<PDFAnnotation *> *)createPdfAnnotationsForPapyrusAnnotation:(NSDictionary *)annotation {
  PDFDocument *document = self.pdfView.document;
  if (!document || ![annotation isKindOfClass:NSDictionary.class]) return @[];
  id pageIndexValue = annotation[@"pageIndex"];
  if (![pageIndexValue isKindOfClass:NSNumber.class]) return @[];
  double pageIndexNumber = [pageIndexValue doubleValue];
  if (!isfinite(pageIndexNumber) || floor(pageIndexNumber) != pageIndexNumber ||
      pageIndexNumber < 0 || pageIndexNumber >= (double)document.pageCount) {
    return @[];
  }

  NSString *type = [annotation[@"type"] isKindOfClass:NSString.class]
      ? annotation[@"type"] : @"";
  NSString *markup = [annotation[@"markupStyle"] isKindOfClass:NSString.class] ? annotation[@"markupStyle"] : ([@[@"highlight",@"underline",@"strikeout",@"squiggly"] containsObject:annotation[@"type"]] ? annotation[@"type"] : nil);
  BOOL hasContextNote = annotation[@"noteContent"] != nil;
  if (hasContextNote && !annotation[@"papyrusIndicatorOnly"]) {
    NSMutableArray *parts = [NSMutableArray array];
    if (markup.length && ![markup isEqual:@"none"]) {
      NSMutableDictionary *mark = [annotation mutableCopy];
      mark[@"type"] = markup; [mark removeObjectForKey:@"noteContent"]; [mark removeObjectForKey:@"markupStyle"];
      [parts addObjectsFromArray:[self createPdfAnnotationsForPapyrusAnnotation:mark]];
    }
    NSMutableDictionary *note = [annotation mutableCopy];
    note[@"type"] = @"comment"; note[@"papyrusIndicatorOnly"] = @YES;
    [parts addObjectsFromArray:[self createPdfAnnotationsForPapyrusAnnotation:note]];
    return parts;
  }
  if (markup.length && !hasContextNote) {
    if ([markup isEqual:@"none"]) return @[];
    type = markup;
  }
  NSString *subtype = nil;
  if ([type isEqualToString:@"highlight"]) subtype = @"Highlight";
  else if ([type isEqualToString:@"underline"]) subtype = @"Underline";
  else if ([type isEqualToString:@"strikeout"]) subtype = @"StrikeOut";
  else if ([type isEqualToString:@"squiggly"] ||
           [type isEqualToString:@"comment"] || [type isEqualToString:@"text"]) {
    // Custom drawing stays in the subclasses; Stamp is a PDFKit-supported carrier subtype.
    subtype = @"Stamp";
  }
  if (!subtype) return @[];

  PDFPage *page = [document pageAtIndex:(NSUInteger)pageIndexNumber];
  if (!page) return @[];
  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsNull(pageBounds) || CGRectIsEmpty(pageBounds)) return @[];

  NSArray *rects = [annotation[@"rects"] isKindOfClass:NSArray.class]
      ? annotation[@"rects"] : @[];
  if ([type isEqualToString:@"comment"] || [type isEqualToString:@"text"]) {
    NSDictionary *rect = rects.lastObject ?: annotation[@"rect"];
    if ([rect isKindOfClass:NSDictionary.class]) {
      CGFloat width = MIN(0.06, 18.0/MAX(1,CGRectGetWidth(pageBounds)));
      CGFloat height = MIN(0.06, 18.0/MAX(1,CGRectGetHeight(pageBounds)));
      CGFloat x = MIN(1-width,MAX(0,[rect[@"x"] doubleValue]+[rect[@"width"] doubleValue]));
      CGFloat y = MIN(1-height,MAX(0,[rect[@"y"] doubleValue]));
      rects = @[@{@"x":@(x),@"y":@(y),@"width":@(width),@"height":@(height)}];
    } else rects = @[];
  } else if (rects.count == 0 && [annotation[@"rect"] isKindOfClass:NSDictionary.class]) {
    rects = @[annotation[@"rect"]];
  }
  if (rects.count == 0) return @[];

  CGFloat defaultOpacity = [type isEqualToString:@"highlight"] ? 0.38 : 1.0;
  CGFloat opacity = [annotation[@"opacity"] respondsToSelector:@selector(doubleValue)]
      ? [annotation[@"opacity"] doubleValue] : defaultOpacity;
  if (!isfinite(opacity)) opacity = 1.0;
  NSString *hexColor = [annotation[@"color"] isKindOfClass:NSString.class]
      ? annotation[@"color"] : self.annotationColor;
  UIColor *color = PapyrusAnnotationColor(hexColor, opacity);
  NSString *content = [annotation[@"content"] isKindOfClass:NSString.class]
      ? annotation[@"content"] : @"";
  NSMutableArray<PDFAnnotation *> *representations = [NSMutableArray array];

  for (id rectValue in rects) {
    if (![rectValue isKindOfClass:NSDictionary.class]) continue;
    CGRect pageRect = PapyrusPdfRectFromNormalizedRect(rectValue, pageBounds);
    if (CGRectIsNull(pageRect) || CGRectIsEmpty(pageRect)) continue;

    PDFAnnotation *representation = nil;
    if ([type isEqualToString:@"squiggly"]) {
      representation = [[PapyrusSquigglyPdfAnnotation alloc]
          initWithBounds:pageRect forType:subtype withProperties:nil];
    } else if ([type isEqualToString:@"comment"] || [type isEqualToString:@"text"]) {
      representation = [[PapyrusCommentPdfAnnotation alloc]
          initWithBounds:pageRect forType:subtype withProperties:nil];
    } else {
      representation = [[PDFAnnotation alloc]
          initWithBounds:pageRect forType:subtype withProperties:nil];
    }
    representation.color = color;
    representation.contents = content;
    representation.shouldDisplay = YES;

    if ([type isEqualToString:@"highlight"] || [type isEqualToString:@"underline"] ||
        [type isEqualToString:@"strikeout"]) {
      CGFloat width = CGRectGetWidth(pageRect);
      CGFloat height = CGRectGetHeight(pageRect);
      representation.quadrilateralPoints = @[
        [NSValue valueWithCGPoint:CGPointMake(0, height)],
        [NSValue valueWithCGPoint:CGPointMake(width, height)],
        [NSValue valueWithCGPoint:CGPointMake(0, 0)],
        [NSValue valueWithCGPoint:CGPointMake(width, 0)]
      ];
    }

    [page addAnnotation:representation];
    [representations addObject:representation];
  }
  return [representations copy];
}

- (void)reconcilePapyrusAnnotations {
  PDFDocument *document = self.pdfView.document;
  if (!document) return;
  BOOL didChangeRepresentations = NO;

  NSMutableDictionary<NSString *, NSDictionary *> *incomingById = [NSMutableDictionary dictionary];
  for (id value in self.annotations) {
    if (![value isKindOfClass:NSDictionary.class]) continue;
    NSDictionary *annotation = (NSDictionary *)value;
    NSString *annotationId = [annotation[@"id"] isKindOfClass:NSString.class]
        ? annotation[@"id"] : @"";
    if (annotationId.length == 0) continue;
    incomingById[annotationId] = annotation;
  }

  for (NSString *existingId in self.papyrusAnnotationsById.allKeys.copy) {
    NSDictionary *updated = incomingById[existingId];
    NSString *nextSignature = updated ? [self annotationSignature:updated] : nil;
    if (!updated || ![nextSignature isEqualToString:self.papyrusAnnotationSignaturesById[existingId]]) {
      [self removePapyrusAnnotationWithId:existingId];
      didChangeRepresentations = YES;
    }
  }

  for (NSString *annotationId in incomingById) {
    if (self.papyrusAnnotationSignaturesById[annotationId]) continue;
    NSDictionary *annotation = incomingById[annotationId];
    NSArray<PDFAnnotation *> *representations =
        [self createPdfAnnotationsForPapyrusAnnotation:annotation];
    for (PDFAnnotation *representation in representations) {
      [self.papyrusAnnotationIdsByObject setObject:annotationId forKey:representation];
    }
    self.papyrusAnnotationsById[annotationId] = representations;
    self.papyrusAnnotationSignaturesById[annotationId] =
        [self annotationSignature:annotation];
    didChangeRepresentations = YES;
  }
  if (didChangeRepresentations) {
    NSMutableDictionary<NSString *, PapyrusCommentPdfAnnotation *> *leaders = [NSMutableDictionary dictionary];
    for (NSString *annotationId in self.papyrusAnnotationsById) {
      for (PDFAnnotation *representation in self.papyrusAnnotationsById[annotationId]) {
        if (![representation isKindOfClass:PapyrusCommentPdfAnnotation.class]) continue;
        PapyrusCommentPdfAnnotation *note = (PapyrusCommentPdfAnnotation *)representation;
        note.groupHidden = NO; note.groupCount = 1;
        CGRect pageBounds = [note.page boundsForBox:kPDFDisplayBoxCropBox];
        NSString *key = [NSString stringWithFormat:@"%ld:%ld:%ld", (long)[document indexForPage:note.page], (long)floor((CGRectGetMinX(note.bounds)-pageBounds.origin.x)/(pageBounds.size.width * 0.035)), (long)floor((CGRectGetMinY(note.bounds)-pageBounds.origin.y)/(pageBounds.size.height * 0.035))];
        PapyrusCommentPdfAnnotation *leader = leaders[key];
        if (leader) { note.groupHidden = YES; leader.groupCount++; } else {leaders[key] = note;}
      }
    }
    [self updateSelectedAnnotationAdornment];
    [self.pdfView setNeedsDisplay];
  }
}

- (void)emitAnnotationFromCurrentSelectionWithType:(NSString *)type {
  if (!self.onAnnotationCreated) return;
  PDFSelection *selection = self.pdfView.currentSelection;
  NSString *text = selection.string ?: @"";
  PDFDocument *document = self.pdfView.document;
  PDFPage *page = selection.pages.firstObject;
  NSInteger pageIndex = document && page ? [document indexForPage:page] : NSNotFound;
  if (!document || !page || pageIndex == NSNotFound || text.length == 0) return;

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  if (CGRectIsNull(pageBounds) || CGRectIsEmpty(pageBounds)) return;
  NSMutableArray<NSDictionary *> *rects = [NSMutableArray array];
  for (PDFSelection *line in selection.selectionsByLine) {
    if (![line.pages containsObject:page]) continue;
    NSDictionary *normalizedRect = PapyrusNormalizedSelectionRect(
        [line boundsForPage:page], pageBounds);
    if (normalizedRect) [rects addObject:normalizedRect];
  }
  if (rects.count == 0) {
    NSDictionary *normalizedRect = PapyrusNormalizedSelectionRect(
        [selection boundsForPage:page], pageBounds);
    if (normalizedRect) [rects addObject:normalizedRect];
  }
  if (rects.count == 0) return;

  CGFloat minX = 1.0, minY = 1.0, maxX = 0.0, maxY = 0.0;
  for (NSDictionary *rect in rects) {
    CGFloat x = [rect[@"x"] doubleValue];
    CGFloat y = [rect[@"y"] doubleValue];
    minX = MIN(minX, x);
    minY = MIN(minY, y);
    maxX = MAX(maxX, x + [rect[@"width"] doubleValue]);
    maxY = MAX(maxY, y + [rect[@"height"] doubleValue]);
  }

  CGFloat opacity = MIN(1.0, MAX(0.0, self.annotationOpacity));
  NSDictionary *annotationRect = nil;
  if ([type isEqualToString:@"comment"] || [type isEqualToString:@"text"]) {
    NSDictionary *firstRect = rects.firstObject;
    CGFloat width = MIN(1.0, MAX(0.08, [firstRect[@"width"] doubleValue]));
    CGFloat height = MIN(1.0, MAX(0.06, [firstRect[@"height"] doubleValue]));
    CGFloat x = MIN(1.0 - width, MAX(0.0, [firstRect[@"x"] doubleValue]));
    CGFloat y = MIN(1.0 - height, MAX(0.0, [firstRect[@"y"] doubleValue]));
    annotationRect = @{@"x" : @(x), @"y" : @(y), @"width" : @(width), @"height" : @(height)};
  } else {
    annotationRect = @{@"x" : @(minX), @"y" : @(minY), @"width" : @(maxX - minX), @"height" : @(maxY - minY)};
  }

  NSDictionary *annotation = @{
    @"id" : [[NSUUID UUID] UUIDString],
    @"pageIndex" : @(pageIndex),
    @"type" : type,
    @"rect" : annotationRect,
    @"rects" : rects,
    @"color" : self.annotationColor ?: @"#fbbf24",
    @"opacity" : @(opacity),
    @"content" : text,
    @"createdAt" : @((long long)([[NSDate date] timeIntervalSince1970] * 1000.0))
  };
  self.onAnnotationCreated(annotation);
}

- (void)emitCommentAtPage:(PDFPage *)page pageIndex:(NSInteger)pageIndex normalizedPoint:(CGPoint)point {
  if (!self.onAnnotationCreated || !page || pageIndex < 0) return;
  CGFloat x = MIN(0.92, MAX(0.0, point.x - 0.02));
  CGFloat y = MIN(0.94, MAX(0.0, point.y - 0.02));
  NSDictionary *rect = @{@"x" : @(x), @"y" : @(y), @"width" : @0.08, @"height" : @0.06};
  NSDictionary *annotation = @{
    @"id" : [[NSUUID UUID] UUIDString],
    @"pageIndex" : @(pageIndex),
    @"type" : @"comment",
    @"rect" : rect,
    @"rects" : @[rect],
    @"color" : self.annotationColor ?: @"#fbbf24",
    @"opacity" : @(MIN(1.0, MAX(0.0, self.annotationOpacity))),
    @"content" : @"",
    @"createdAt" : @((long long)([[NSDate date] timeIntervalSince1970] * 1000.0))
  };
  self.onAnnotationCreated(annotation);
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
      CGRect pageRect = PapyrusPdfRectFromNormalizedRect((NSDictionary *)rectValue, pageBounds);
      if (CGRectIsNull(pageRect) || CGRectIsEmpty(pageRect)) continue;
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
  [self updateInkCanvasInputAndPicker];
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
    if (!interaction || !selection.string.length || !page ||
        (!self.onDefineSelection && !self.onAnnotationCreated)) return;

    CGRect selectionRect = [selection boundsForPage:page];
    CGRect viewRect = [self.pdfView convertRect:selectionRect fromPage:page];
    if (CGRectIsNull(viewRect) || CGRectIsEmpty(viewRect)) return;
    self.contextualAnnotationMenuId = nil;
    self.contextualAnnotationMenuConfigurationId = nil;
    CGPoint sourcePoint = CGPointMake(CGRectGetMidX(viewRect), CGRectGetMidY(viewRect));
    UIEditMenuConfiguration *configuration =
        [UIEditMenuConfiguration configurationWithIdentifier:signature sourcePoint:sourcePoint];
    [interaction presentEditMenuWithConfiguration:configuration];
  }
}

- (void)presentAnnotationEditMenuForId:(NSString *)annotationId atPoint:(CGPoint)point {
  if (@available(iOS 16.0, *)) {
    UIEditMenuInteraction *interaction = self.editMenuInteraction;
    if (!interaction || !self.onAnnotationDelete ||
        self.annotationDeleteLabel.length == 0 || annotationId.length == 0) return;

    NSString *configurationId = [NSString stringWithFormat:
        @"com.papyrus.annotation.delete.%@.%@", annotationId, [[NSUUID UUID] UUIDString]];
    self.contextualAnnotationMenuId = [annotationId copy];
    self.contextualAnnotationMenuConfigurationId = configurationId;
    self.contextualAnnotationMenuSourcePoint = point;
    UIEditMenuConfiguration *configuration = [UIEditMenuConfiguration configurationWithIdentifier:configurationId sourcePoint:point];
    [interaction presentEditMenuWithConfiguration:configuration];
  }
}

- (void)dismissAnnotationMenuForDocumentChange {
  self.contextualAnnotationMenuId = nil;
  self.contextualAnnotationMenuConfigurationId = nil;
  self.contextualAnnotationMenuSourcePoint = CGPointZero;
  if (@available(iOS 16.0, *)) {
    [self.editMenuInteraction dismissMenu];
  }
  if (self.onAnnotationDeselected) self.onAnnotationDeselected(@{});
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
  if (self.contextualAnnotationMenuId.length > 0 &&
      [(NSString *)configuration.identifier isEqualToString:self.contextualAnnotationMenuConfigurationId]) {
    NSString *annotationId = [self.contextualAnnotationMenuId copy];
    if (!self.onAnnotationDelete || self.annotationDeleteLabel.length == 0) return nil;
    PDFDocument *documentAtPresentation = self.pdfView.document;
    __weak typeof(self) weakSelf = self;
    UIAction *deleteAction = [UIAction
        actionWithTitle:self.annotationDeleteLabel
                  image:[UIImage systemImageNamed:@"trash"]
             identifier:@"com.papyrus.annotation.delete"
                handler:^(__kindof UIAction *action) {
      typeof(self) strongSelf = weakSelf;
      if (!strongSelf || strongSelf.pdfView.document != documentAtPresentation) return;
      [strongSelf emitAnnotationDeleteWithId:annotationId];
    }];
    return [UIMenu menuWithChildren:@[deleteAction]];
  }

  NSMutableArray<UIMenuElement *> *actions = [NSMutableArray array];

  if (self.onDefineSelection && self.defineLabel.length > 0 &&
      self.pdfView.currentSelection.string.length > 0 &&
      (![self.defineSelectionMode isEqualToString:@"single-word"] ||
       [self isSingleWordSelection:self.pdfView.currentSelection.string])) {
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

  if (self.onAnnotationCreated && self.annotateLabel.length > 0 &&
      self.pdfView.currentSelection.string.length > 0) {
    __weak typeof(self) weakSelf = self;
    UIAction *highlightAction = [UIAction
        actionWithTitle:self.annotationHighlightLabel
                  image:[UIImage systemImageNamed:@"highlighter"]
             identifier:@"com.papyrus.annotation.highlight"
                handler:^(__kindof UIAction *action) {
      [weakSelf emitAnnotationFromCurrentSelectionWithType:@"highlight"];
    }];
    UIAction *underlineAction = [UIAction
        actionWithTitle:self.annotationUnderlineLabel
                  image:[UIImage systemImageNamed:@"underline"]
             identifier:@"com.papyrus.annotation.underline"
                handler:^(__kindof UIAction *action) {
      [weakSelf emitAnnotationFromCurrentSelectionWithType:@"underline"];
    }];
    UIAction *strikeoutAction = [UIAction
        actionWithTitle:self.annotationStrikeoutLabel
                  image:[UIImage systemImageNamed:@"strikethrough"]
             identifier:@"com.papyrus.annotation.strikeout"
                handler:^(__kindof UIAction *action) {
      [weakSelf emitAnnotationFromCurrentSelectionWithType:@"strikeout"];
    }];
    UIAction *squigglyAction = [UIAction
        actionWithTitle:self.annotationSquigglyLabel
                  image:[UIImage systemImageNamed:@"scribble"]
             identifier:@"com.papyrus.annotation.squiggly"
                handler:^(__kindof UIAction *action) {
      [weakSelf emitAnnotationFromCurrentSelectionWithType:@"squiggly"];
    }];
    UIAction *noteAction = [UIAction
        actionWithTitle:self.annotationNoteLabel
                  image:[UIImage systemImageNamed:@"note.text"]
             identifier:@"com.papyrus.annotation.comment"
                handler:^(__kindof UIAction *action) {
      [weakSelf emitAnnotationFromCurrentSelectionWithType:@"comment"];
    }];
    UIMenu *annotationMenu = [UIMenu menuWithTitle:self.annotateLabel
                                         children:@[highlightAction, underlineAction,
                                                    strikeoutAction, squigglyAction, noteAction]];
    [actions addObject:annotationMenu];
  }

  [actions addObjectsFromArray:suggestedActions ?: @[]];

  return [UIMenu menuWithChildren:actions];
}

- (BOOL)isSingleWordSelection:(NSString *)text {
  NSString *trimmed = [text stringByTrimmingCharactersInSet:
      NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if (trimmed.length == 0) return NO;
  NSArray<NSString *> *words = [trimmed componentsSeparatedByCharactersInSet:
      NSCharacterSet.whitespaceAndNewlineCharacterSet];
  return words.count == 1 && words.firstObject.length > 0;
}

- (CGRect)editMenuInteraction:(UIEditMenuInteraction *)interaction
    targetRectForConfiguration:(UIEditMenuConfiguration *)configuration API_AVAILABLE(ios(16.0)) {
  if (self.contextualAnnotationMenuId.length > 0 &&
      [(NSString *)configuration.identifier isEqualToString:self.contextualAnnotationMenuConfigurationId]) {
    CGPoint point = self.contextualAnnotationMenuSourcePoint;
    return CGRectMake(point.x, point.y, 1.0, 1.0);
  }

  PDFSelection *selection = self.pdfView.currentSelection;
  PDFPage *page = selection.pages.firstObject;
  if (!selection || !page) return CGRectZero;

  CGRect selectionRect = [selection boundsForPage:page];
  CGRect viewRect = [self.pdfView convertRect:selectionRect fromPage:page];
  return CGRectIsNull(viewRect) || CGRectIsEmpty(viewRect) ? CGRectZero : viewRect;
}

- (void)editMenuInteraction:(UIEditMenuInteraction *)interaction
    willDismissMenuForConfiguration:(UIEditMenuConfiguration *)configuration
                         animator:(id<UIEditMenuInteractionAnimating>)animator API_AVAILABLE(ios(16.0)) {
  if (self.contextualAnnotationMenuId.length == 0 ||
      ![(NSString *)configuration.identifier isEqualToString:self.contextualAnnotationMenuConfigurationId]) return;

  self.contextualAnnotationMenuId = nil;
  self.contextualAnnotationMenuConfigurationId = nil;
  self.contextualAnnotationMenuSourcePoint = CGPointZero;
  if (self.onAnnotationDeselected) self.onAnnotationDeselected(@{});
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

- (void)emitAnnotationDeleteWithId:(NSString *)annotationId {
  NSArray<PDFAnnotation *> *representations = self.papyrusAnnotationsById[annotationId];
  if (annotationId.length == 0 || representations.count == 0 || !self.onAnnotationDelete) return;
  self.onAnnotationDelete(@{@"id" : annotationId});
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
  if ([self.activeTool isEqualToString:@"ink"]) return;
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

  PDFAnnotation *hitAnnotation = nil;
  NSString *annotationId = nil;
  for (id candidateValue in [self.annotations reverseObjectEnumerator]) {
    if (![candidateValue isKindOfClass:NSDictionary.class]) continue;
    NSDictionary *candidate = (NSDictionary *)candidateValue;
    NSString *candidateId = [candidate[@"id"] isKindOfClass:NSString.class]
        ? candidate[@"id"] : nil;
    if (candidateId.length == 0) continue;
    NSArray<PDFAnnotation *> *representations = self.papyrusAnnotationsById[candidateId] ?: @[];
    for (PDFAnnotation *representation in [representations reverseObjectEnumerator]) {
      if (representation.page != page ||
          !CGRectContainsPoint(CGRectInset(representation.bounds, -4.0, -4.0), pagePoint)) {
        continue;
      }
      NSString *registeredId = [self.papyrusAnnotationIdsByObject objectForKey:representation];
      if (![registeredId isEqualToString:candidateId]) continue;
      hitAnnotation = representation;
      annotationId = candidateId;
      break;
    }
    if (hitAnnotation) break;
  }
  if (annotationId.length > 0) {
    NSDictionary *papyrusAnnotation = nil;
    for (id value in self.annotations) {
      if (![value isKindOfClass:NSDictionary.class]) continue;
      NSDictionary *candidate = (NSDictionary *)value;
      if ([candidate[@"id"] isEqual:annotationId]) {
        papyrusAnnotation = candidate;
        break;
      }
    }
    if (@available(iOS 16.0, *)) {
      [self.editMenuInteraction dismissMenu];
    }
    if (self.onAnnotationTap) {
      self.onAnnotationTap(@{
        @"id" : annotationId,
        @"pageIndex" : @(pageIndex),
        @"type" : papyrusAnnotation[@"type"] ?: @"",
        @"color" : papyrusAnnotation[@"color"] ?: @""
      });
    }
    NSString *annotationType = [papyrusAnnotation[@"type"] isKindOfClass:NSString.class]
        ? papyrusAnnotation[@"type"] : @"";
    if (!papyrusAnnotation[@"noteContent"] && ![annotationType isEqualToString:@"comment"] &&
        ![annotationType isEqualToString:@"text"]) {
      [self presentAnnotationEditMenuForId:annotationId atPoint:viewPoint];
    }
    return;
  }

  if (self.pdfView.currentSelection && ![self selectionContainsViewPoint:viewPoint]) {
    [self clearCurrentSelection];
    return;
  }

  CGPoint normalizedPoint = CGPointMake(MIN(1.0, MAX(0.0, x)),
                                         MIN(1.0, MAX(0.0, y)));
  if ([self.activeTool isEqualToString:@"comment"]) {
    CGRect pageViewBounds = [self.pdfView convertRect:pageBounds fromPage:page];
    if (CGRectContainsPoint(pageViewBounds, viewPoint)) {
      [self emitCommentAtPage:page pageIndex:pageIndex normalizedPoint:normalizedPoint];
    }
    return;
  }

  if (self.onTap) {
    self.onTap(@{
      @"pageIndex" : @(pageIndex),
      @"x" : @(normalizedPoint.x),
      @"y" : @(normalizedPoint.y)
    });
  }
}

- (void)handleDocumentDoubleTap:(UITapGestureRecognizer *)recognizer {
  if (recognizer.state != UIGestureRecognizerStateEnded) return;
  if ([self.activeTool isEqualToString:@"ink"]) return;
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
