#import <React/RCTViewManager.h>

#import "PapyrusPdfDocumentView.h"

@interface PapyrusPdfDocumentViewManager : RCTViewManager
@end

@implementation PapyrusPdfDocumentViewManager

RCT_EXPORT_MODULE(PapyrusPdfDocumentView)
RCT_EXPORT_VIEW_PROPERTY(engineId, NSString)
RCT_EXPORT_VIEW_PROPERTY(pageTheme, NSString)
RCT_EXPORT_VIEW_PROPERTY(zoom, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(currentPage, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(viewMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(selectionActive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(defineLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(onPageChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onZoomChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onVisiblePagesChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onTextSelected, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onDefineSelection, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onScroll, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onTap, RCTBubblingEventBlock)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (UIView *)view {
  return [[PapyrusPdfDocumentView alloc] initWithFrame:CGRectZero];
}

@end
