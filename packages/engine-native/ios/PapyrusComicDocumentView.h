#import <UIKit/UIKit.h>
#import <React/RCTComponent.h>

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusComicDocumentView : UIView <UICollectionViewDataSource, UICollectionViewDelegate, UICollectionViewDelegateFlowLayout>
@property (nonatomic, copy, nullable) NSString *engineId;
@property (nonatomic, assign) NSInteger documentGeneration;
@property (nonatomic, assign) NSInteger pageCount;
@property (nonatomic, assign) NSInteger currentPage;
@property (nonatomic, copy) NSString *layoutMode;
@property (nonatomic, copy) NSString *fitMode;
@property (nonatomic, copy) NSString *readingDirection;
@property (nonatomic, assign) CGFloat zoom;
@property (nonatomic, copy) NSString *pageTheme;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onPageChanged;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onZoomChanged;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onError;
@end

NS_ASSUME_NONNULL_END
