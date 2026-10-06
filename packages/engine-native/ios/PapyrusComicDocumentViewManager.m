#import <React/RCTViewManager.h>
#import "PapyrusComicDocumentView.h"

@interface PapyrusComicDocumentViewManager : RCTViewManager
@end

@implementation PapyrusComicDocumentViewManager
RCT_EXPORT_MODULE(PapyrusComicDocumentView)
RCT_EXPORT_VIEW_PROPERTY(engineId, NSString)
RCT_EXPORT_VIEW_PROPERTY(documentGeneration, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(pageCount, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(currentPage, NSInteger)
RCT_EXPORT_VIEW_PROPERTY(layoutMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(fitMode, NSString)
RCT_EXPORT_VIEW_PROPERTY(readingDirection, NSString)
RCT_EXPORT_VIEW_PROPERTY(zoom, CGFloat)
RCT_EXPORT_VIEW_PROPERTY(pageTheme, NSString)
RCT_EXPORT_VIEW_PROPERTY(onPageChanged, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onZoomChanged, RCTBubblingEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onError, RCTBubblingEventBlock)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (UIView *)view { return [[PapyrusComicDocumentView alloc] initWithFrame:CGRectZero]; }
@end
