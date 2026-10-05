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
RCT_EXPORT_VIEW_PROPERTY(searchResults, NSArray)
RCT_EXPORT_VIEW_PROPERTY(activeSearchIndex, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(annotations, NSArray)
RCT_EXPORT_VIEW_PROPERTY(activeTool, NSString)
RCT_EXPORT_VIEW_PROPERTY(activeDrawToolPreset, NSString)
RCT_EXPORT_VIEW_PROPERTY(inkStrokeWidth, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(annotationColor, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationSelectionColor, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationOpacity, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(selectedAnnotationId, NSString)
RCT_EXPORT_VIEW_PROPERTY(selectionActive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(defineLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotateLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationHighlightLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationUnderlineLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationStrikeoutLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationSquigglyLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationNoteLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(annotationDeleteLabel, NSString)
RCT_EXPORT_VIEW_PROPERTY(onPageChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onZoomChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onVisiblePagesChange, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onTextSelected, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onDefineSelection, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAnnotationCreated, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAnnotationTap, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAnnotationDelete, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onAnnotationDeselected, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onInkDrawingCommitted, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onScroll, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onTap, RCTBubblingEventBlock)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (UIView *)view {
  return [[PapyrusPdfDocumentView alloc] initWithFrame:CGRectZero];
}

@end
