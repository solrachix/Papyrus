#import <UIKit/UIKit.h>
#import <PDFKit/PDFKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusPageView : UIView

@property (nonatomic, copy) NSString *pageTheme;

- (void)renderWithDocument:(PDFDocument *_Nullable)document
                 pageIndex:(NSInteger)pageIndex
                     scale:(CGFloat)scale
                      zoom:(CGFloat)zoom
                  rotation:(NSInteger)rotation;

- (CGRect)convertRectToPage:(CGRect)rect page:(PDFPage *)page;
- (CGRect)convertRectFromPage:(CGRect)rect page:(PDFPage *)page;

@end

NS_ASSUME_NONNULL_END
