#import "PapyrusPageView.h"

@interface PapyrusPageView ()
@property (nonatomic, strong) PDFView *pdfView;
@end

@implementation PapyrusPageView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _pdfView = [[PDFView alloc] initWithFrame:self.bounds];
    _pdfView.displayBox = kPDFDisplayBoxCropBox;
    _pdfView.autoScales = NO;
    _pdfView.displayMode = kPDFDisplaySinglePage;
    _pdfView.displayDirection = kPDFDisplayDirectionVertical;
    _pdfView.displaysPageBreaks = NO;
    _pdfView.userInteractionEnabled = NO;
    [self addSubview:_pdfView];
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  self.pdfView.frame = self.bounds;
}

- (void)renderWithDocument:(PDFDocument *_Nullable)document
                 pageIndex:(NSInteger)pageIndex
                     scale:(CGFloat)scale
                      zoom:(CGFloat)zoom
                  rotation:(NSInteger)rotation {
  if (!document) {
    self.pdfView.document = nil;
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
}

- (CGRect)convertRectToPage:(CGRect)rect page:(PDFPage *)page {
  return [self.pdfView convertRect:rect toPage:page];
}

- (CGRect)convertRectFromPage:(CGRect)rect page:(PDFPage *)page {
  return [self.pdfView convertRect:rect fromPage:page];
}

@end
