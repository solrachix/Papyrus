#import <UIKit/UIKit.h>
#import <React/RCTComponent.h>
#import <PDFKit/PDFKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusTextDocumentView : UIView <UITextViewDelegate, UIEditMenuInteractionDelegate>
@property (nonatomic, copy, nullable) NSString *engineId;
@property (nonatomic, assign) NSInteger documentGeneration;
@property (nonatomic, assign) NSInteger textLength;
@property (nonatomic, assign) NSInteger currentTextOffset;
@property (nonatomic, strong, nullable) NSNumber *scrollToTextOffsetSignal;
@property (nonatomic, copy, nullable) NSDictionary *textNavigationRequest;
@property (nonatomic, copy) NSArray<NSDictionary *> *searchResults;
@property (nonatomic, copy) NSArray<NSDictionary *> *annotations;
@property (nonatomic, copy) NSDictionary<NSString *, NSString *> *annotationLabels;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onAnnotateSelection;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onAnnotationTap;
@property (nonatomic, assign) NSInteger activeSearchIndex;
@property (nonatomic, copy) NSString *pageTheme;
@property (nonatomic, copy) NSString *uiTheme;
@property (nonatomic, assign) CGFloat fontSize;
@property (nonatomic, assign) CGFloat lineHeight;
@property (nonatomic, assign) CGFloat pageMargin;
@property (nonatomic, copy) NSString *defineLabel;
@property (nonatomic, copy) NSString *defineSelectionMode;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onTextOffsetChange;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onTextRangeSelected;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onDefineSelection;
@end

NS_ASSUME_NONNULL_END
