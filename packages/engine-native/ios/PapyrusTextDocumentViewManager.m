#import <React/RCTViewManager.h>
#import "PapyrusTextDocumentView.h"

@interface PapyrusTextDocumentViewManager : RCTViewManager
@end

@implementation PapyrusTextDocumentViewManager
RCT_EXPORT_MODULE(PapyrusTextDocumentView)
RCT_EXPORT_VIEW_PROPERTY(engineId, NSString)
RCT_EXPORT_VIEW_PROPERTY(documentGeneration, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(textLength, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(currentTextOffset, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(scrollToTextOffsetSignal, NSNumber)
RCT_EXPORT_VIEW_PROPERTY(textNavigationRequest, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(searchResults, NSArray)
RCT_EXPORT_VIEW_PROPERTY(annotations, NSArray)
RCT_EXPORT_VIEW_PROPERTY(annotationLabels, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onAnnotateSelection, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAnnotationTap, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(activeSearchIndex, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(pageTheme, NSString)
RCT_EXPORT_VIEW_PROPERTY(uiTheme, NSString)
RCT_EXPORT_VIEW_PROPERTY(fontSize, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(lineHeight, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(pageMargin, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(defineLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(defineSelectionMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(onTextOffsetChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onTextRangeSelected, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onDefineSelection, RCTBubblingEventBlock)

+ (BOOL)requiresMainQueueSetup { return YES; }
- (UIView *)view { return [[PapyrusTextDocumentView alloc] initWithFrame:CGRectZero]; }
@end
