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
@property (nonatomic, copy) NSArray<NSDictionary *> *searchResults;
@property (nonatomic, assign) NSInteger activeSearchIndex;
@property (nonatomic, copy) NSArray<NSDictionary *> *annotations;
@property (nonatomic, copy, nullable) NSDictionary *annotationNavigationRequest;
@property (nonatomic, copy) NSString *activeTool;
@property (nonatomic, copy) NSString *activeDrawToolPreset;
@property (nonatomic, assign) CGFloat inkStrokeWidth;
@property (nonatomic, copy) NSString *annotationColor;
@property (nonatomic, copy) NSString *annotationSelectionColor;
@property (nonatomic, assign) CGFloat annotationOpacity;
@property (nonatomic, copy, nullable) NSString *selectedAnnotationId;
@property (nonatomic, assign) BOOL selectionActive;
@property (nonatomic, copy) NSString *defineLabel;
@property (nonatomic, copy) NSString *copyLabel;
@property (nonatomic, copy) NSString *selectAllLabel;
@property (nonatomic, copy) NSString *defineSelectionMode;
@property (nonatomic, copy) NSString *annotateLabel;
@property (nonatomic, copy) NSString *annotationHighlightLabel;
@property (nonatomic, copy) NSString *annotationUnderlineLabel;
@property (nonatomic, copy) NSString *annotationStrikeoutLabel;
@property (nonatomic, copy) NSString *annotationSquigglyLabel;
@property (nonatomic, copy) NSString *annotationNoteLabel;
@property (nonatomic, copy) NSString *annotationDeleteLabel;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onPageChange;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onZoomChange;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onVisiblePagesChange;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onTextSelected;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onDefineSelection;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onAnnotationCreated;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onAnnotationTap;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onAnnotationDelete;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onAnnotationDeselected;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onInkDrawingCommitted;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onInkToolPickerVisibilityChange;
@property (nonatomic, copy, nullable) RCTDirectEventBlock onScroll;
@property (nonatomic, copy, nullable) RCTBubblingEventBlock onTap;

@end

NS_ASSUME_NONNULL_END
