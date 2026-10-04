#import <PDFKit/PDFKit.h>
#import <React/RCTComponent.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusPdfDocumentView : UIView <UIGestureRecognizerDelegate>

@property (nonatomic, copy, nullable) NSString *engineId;
@property (nonatomic, copy) NSString *pageTheme;
@property (nonatomic, assign) CGFloat zoom;
@property (nonatomic, assign) NSInteger currentPage;
@property (nonatomic, copy) NSString *viewMode;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onPageChange;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onZoomChange;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onVisiblePagesChange;
@property (nonatomic, copy, nullable) RCTDirectEventBlock onScroll;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onTap;

@end

NS_ASSUME_NONNULL_END
