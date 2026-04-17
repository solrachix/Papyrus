#import "PapyrusPageView.h"

#import <CoreImage/CoreImage.h>

@interface PapyrusPageView ()
@property (nonatomic, strong) PDFView *pdfView;
@property (nonatomic, strong) UIImageView *imageView;
@property (nonatomic, strong) CIContext *ciContext;
@property (nonatomic, weak) PDFDocument *currentDocument;
@property (nonatomic, assign) NSInteger currentPageIndex;
@property (nonatomic, assign) NSInteger currentRotation;
@property (nonatomic, assign) CGFloat currentScale;
@property (nonatomic, assign) CGFloat currentZoom;
@end

@implementation PapyrusPageView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _pageTheme = @"normal";
    _currentPageIndex = NSNotFound;
    _currentRotation = 0;
    _currentScale = 1.0;
    _currentZoom = 1.0;
    _ciContext = [CIContext contextWithOptions:nil];

    _pdfView = [[PDFView alloc] initWithFrame:self.bounds];
    _pdfView.displayBox = kPDFDisplayBoxCropBox;
    _pdfView.autoScales = NO;
    _pdfView.displayMode = kPDFDisplaySinglePage;
    _pdfView.displayDirection = kPDFDisplayDirectionVertical;
    _pdfView.displaysPageBreaks = NO;
    _pdfView.userInteractionEnabled = NO;
    _pdfView.hidden = YES;
    [self addSubview:_pdfView];

    _imageView = [[UIImageView alloc] initWithFrame:self.bounds];
    _imageView.contentMode = UIViewContentModeScaleAspectFit;
    _imageView.clipsToBounds = YES;
    [self addSubview:_imageView];
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  self.pdfView.frame = self.bounds;
  self.imageView.frame = self.bounds;
  [self rerenderCurrentPageIfNeeded];
}

- (void)setPageTheme:(NSString *)pageTheme {
  NSString *normalized = pageTheme.length > 0 ? pageTheme : @"normal";
  if ([_pageTheme isEqualToString:normalized]) return;
  _pageTheme = [normalized copy];
  [self rerenderCurrentPageIfNeeded];
}

- (void)renderWithDocument:(PDFDocument *_Nullable)document
                 pageIndex:(NSInteger)pageIndex
                     scale:(CGFloat)scale
                      zoom:(CGFloat)zoom
                  rotation:(NSInteger)rotation {
  self.currentDocument = document;
  self.currentPageIndex = pageIndex;
  self.currentRotation = rotation;
  self.currentScale = scale;
  self.currentZoom = zoom;

  if (!document) {
    self.pdfView.document = nil;
    self.imageView.image = nil;
    return;
  }

  if (self.pdfView.document != document) {
    self.pdfView.document = document;
  }

  PDFPage *page = [document pageAtIndex:pageIndex];
  if (!page) return;

  page.rotation = (int)rotation;
  [self.pdfView goToPage:page];

  CGFloat clampedZoom = MAX(0.1, MIN(5.0, zoom));
  CGFloat baseScale = self.pdfView.scaleFactorForSizeToFit;
  CGFloat targetScale = baseScale * MAX(0.1, scale) * clampedZoom;
  self.pdfView.scaleFactor = targetScale;

  [self rerenderCurrentPageIfNeeded];
}

- (CGRect)convertRectToPage:(CGRect)rect page:(PDFPage *)page {
  return [self.pdfView convertRect:rect toPage:page];
}

- (CGRect)convertRectFromPage:(CGRect)rect page:(PDFPage *)page {
  return [self.pdfView convertRect:rect fromPage:page];
}

- (void)rerenderCurrentPageIfNeeded {
  if (!self.currentDocument) return;
  if (self.currentPageIndex == NSNotFound) return;
  if (CGRectGetWidth(self.bounds) <= 0 || CGRectGetHeight(self.bounds) <= 0) {
    return;
  }

  PDFPage *page = [self.currentDocument pageAtIndex:self.currentPageIndex];
  if (!page) return;

  UIImage *baseImage = [self renderImageForPage:page];
  self.imageView.image = [self themedImageFromImage:baseImage];
}

- (UIImage *)renderImageForPage:(PDFPage *)page {
  CGSize targetSize = self.bounds.size;
  UIGraphicsImageRendererFormat *format =
      [UIGraphicsImageRendererFormat defaultFormat];
  format.opaque = YES;
  format.scale = UIScreen.mainScreen.scale;

  UIGraphicsImageRenderer *renderer =
      [[UIGraphicsImageRenderer alloc] initWithSize:targetSize format:format];

  return [renderer imageWithActions:^(UIGraphicsImageRendererContext *_Nonnull context) {
    CGContextRef cgContext = context.CGContext;
    CGContextSetFillColorWithColor(cgContext, UIColor.whiteColor.CGColor);
    CGContextFillRect(cgContext, (CGRect){CGPointZero, targetSize});

    CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
    if (CGRectGetWidth(pageBounds) <= 0 || CGRectGetHeight(pageBounds) <= 0) {
      return;
    }

    CGFloat scaleX = targetSize.width / CGRectGetWidth(pageBounds);
    CGFloat scaleY = targetSize.height / CGRectGetHeight(pageBounds);
    CGFloat fitScale = MIN(scaleX, scaleY);
    CGFloat drawWidth = CGRectGetWidth(pageBounds) * fitScale;
    CGFloat drawHeight = CGRectGetHeight(pageBounds) * fitScale;
    CGFloat offsetX = (targetSize.width - drawWidth) / 2.0;
    CGFloat offsetY = (targetSize.height - drawHeight) / 2.0;

    CGContextSaveGState(cgContext);
    CGContextTranslateCTM(cgContext, 0, targetSize.height);
    CGContextScaleCTM(cgContext, 1, -1);
    CGContextTranslateCTM(cgContext, offsetX, offsetY);
    CGContextScaleCTM(cgContext, fitScale, fitScale);
    [page drawWithBox:kPDFDisplayBoxCropBox toContext:cgContext];
    CGContextRestoreGState(cgContext);
  }];
}

- (UIImage *)themedImageFromImage:(UIImage *)image {
  if (!image) return nil;
  if ([self.pageTheme isEqualToString:@"normal"]) return image;

  CIImage *input = [[CIImage alloc] initWithImage:image];
  if (!input) return image;

  CIImage *output = input;

  if ([self.pageTheme isEqualToString:@"sepia"]) {
    CIFilter *sepia = [CIFilter filterWithName:@"CISepiaTone"];
    [sepia setValue:output forKey:kCIInputImageKey];
    [sepia setValue:@0.85 forKey:kCIInputIntensityKey];
    output = sepia.outputImage ?: output;
  } else if ([self.pageTheme isEqualToString:@"dark"] ||
             [self.pageTheme isEqualToString:@"high-contrast"]) {
    CIFilter *invert = [CIFilter filterWithName:@"CIColorInvert"];
    [invert setValue:output forKey:kCIInputImageKey];
    output = invert.outputImage ?: output;

    CIFilter *controls = [CIFilter filterWithName:@"CIColorControls"];
    [controls setValue:output forKey:kCIInputImageKey];
    [controls setValue:@0 forKey:kCIInputSaturationKey];
    [controls setValue:([self.pageTheme isEqualToString:@"high-contrast"] ? @1.25 : @0.9)
                forKey:kCIInputContrastKey];
    [controls setValue:([self.pageTheme isEqualToString:@"high-contrast"] ? @0.02 : @-0.08)
                forKey:kCIInputBrightnessKey];
    output = controls.outputImage ?: output;
  }

  CGImageRef cgImage = [self.ciContext createCGImage:output fromRect:output.extent];
  if (!cgImage) return image;
  UIImage *result = [UIImage imageWithCGImage:cgImage
                                        scale:image.scale
                                  orientation:image.imageOrientation];
  CGImageRelease(cgImage);
  return result;
}

@end
