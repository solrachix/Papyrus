#import <React/RCTViewManager.h>
#import "PapyrusPageView.h"

@interface PapyrusPageViewManager : RCTViewManager
@end

@implementation PapyrusPageViewManager

RCT_EXPORT_MODULE(PapyrusPageView)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (UIView *)view {
  return [[PapyrusPageView alloc] initWithFrame:CGRectZero];
}

@end
