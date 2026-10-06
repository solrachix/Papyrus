#import "PapyrusPdfPageTheme.h"

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

@class PapyrusThemedPdfPage;

@interface PapyrusPdfPageThemeDelegate : NSObject <PDFDocumentDelegate>
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSString *> *themesByLease;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *sequenceByLease;
@property (nonatomic, assign) NSUInteger nextSequence;
- (void)setTheme:(NSString *)theme forLease:(NSString *)leaseToken;
- (void)removeLease:(NSString *)leaseToken;
- (nullable NSString *)activeTheme;
@end

@interface PapyrusThemedPdfPage : PDFPage
@end

static const void *PapyrusPdfPageThemeDelegateAssociationKey =
    &PapyrusPdfPageThemeDelegateAssociationKey;

static NSSet<NSString *> *PapyrusSupportedPdfPageThemes(void) {
  static NSSet<NSString *> *themes;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    themes = [NSSet setWithArray:@[@"normal", @"sepia", @"dark", @"high-contrast"]];
  });
  return themes;
}

static PapyrusPdfPageThemeDelegate *PapyrusThemeDelegateForDocument(
    PDFDocument *document,
    BOOL createIfMissing) {
  if (!document) return nil;

  @synchronized(document) {
    PapyrusPdfPageThemeDelegate *delegate =
        objc_getAssociatedObject(document, PapyrusPdfPageThemeDelegateAssociationKey);
    if (!delegate && createIfMissing) {
      delegate = [[PapyrusPdfPageThemeDelegate alloc] init];
      objc_setAssociatedObject(document,
                               PapyrusPdfPageThemeDelegateAssociationKey,
                               delegate,
                               OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    if (delegate && document.delegate != delegate) {
      document.delegate = delegate;
    }
    return delegate;
  }
}

static UIColor *PapyrusThemeTintColor(NSString *theme) {
  if ([theme isEqualToString:@"sepia"]) {
    return [UIColor colorWithRed:0.96 green:0.88 blue:0.73 alpha:1.0];
  }
  return UIColor.whiteColor;
}

static void PapyrusCompositeColor(CGContextRef context,
                                  CGRect bounds,
                                  UIColor *color,
                                  CGBlendMode blendMode,
                                  CGFloat alpha) {
  CGContextSaveGState(context);
  CGContextSetBlendMode(context, blendMode);
  CGContextSetAlpha(context, alpha);
  CGContextSetFillColorWithColor(context, color.CGColor);
  CGContextFillRect(context, bounds);
  CGContextRestoreGState(context);
}

static void PapyrusApplyPageTheme(NSString *theme,
                                  CGRect pageBounds,
                                  CGContextRef context) {
  if ([theme isEqualToString:@"sepia"]) {
    PapyrusCompositeColor(context,
                          pageBounds,
                          PapyrusThemeTintColor(theme),
                          kCGBlendModeMultiply,
                          0.42);
    return;
  }

  if ([theme isEqualToString:@"dark"] ||
      [theme isEqualToString:@"high-contrast"]) {
    PapyrusCompositeColor(context,
                          pageBounds,
                          [UIColor colorWithWhite:0.5 alpha:1.0],
                          kCGBlendModeSaturation,
                          1.0);
    PapyrusCompositeColor(context,
                          pageBounds,
                          UIColor.whiteColor,
                          kCGBlendModeDifference,
                          1.0);
    if ([theme isEqualToString:@"high-contrast"]) {
      PapyrusCompositeColor(context,
                            pageBounds,
                            UIColor.whiteColor,
                            kCGBlendModeColorDodge,
                            0.24);
    }
  }
}

@implementation PapyrusPdfPageThemeDelegate

- (instancetype)init {
  self = [super init];
  if (self) {
    _themesByLease = [NSMutableDictionary dictionary];
    _sequenceByLease = [NSMutableDictionary dictionary];
  }
  return self;
}

- (Class)classForPage {
  return PapyrusThemedPdfPage.class;
}

- (void)setTheme:(NSString *)theme forLease:(NSString *)leaseToken {
  if (leaseToken.length == 0 || theme.length == 0) return;
  @synchronized(self) {
    self.themesByLease[leaseToken] = [theme copy];
    self.sequenceByLease[leaseToken] = @(++self.nextSequence);
  }
}

- (void)removeLease:(NSString *)leaseToken {
  if (leaseToken.length == 0) return;
  @synchronized(self) {
    [self.themesByLease removeObjectForKey:leaseToken];
    [self.sequenceByLease removeObjectForKey:leaseToken];
  }
}

- (NSString *)activeTheme {
  @synchronized(self) {
    NSString *activeLease = nil;
    NSUInteger activeSequence = 0;
    for (NSString *lease in self.sequenceByLease) {
      NSUInteger sequence = self.sequenceByLease[lease].unsignedIntegerValue;
      if (!activeLease || sequence > activeSequence) {
        activeLease = lease;
        activeSequence = sequence;
      }
    }
    return activeLease ? [self.themesByLease[activeLease] copy] : nil;
  }
}

@end

@implementation PapyrusThemedPdfPage

- (void)drawWithBox:(PDFDisplayBox)box toContext:(CGContextRef)context {
  NSString *theme =
      [PapyrusThemeDelegateForDocument(self.document, NO) activeTheme];
  if (!context) return;
  if (!theme || ![PapyrusSupportedPdfPageThemes() containsObject:theme] ||
      [theme isEqualToString:@"normal"] || !self.pageRef) {
    [super drawWithBox:box toContext:context];
    return;
  }

  CGRect pageBounds = [self boundsForBox:box];
  if (CGRectIsNull(pageBounds) || CGRectIsEmpty(pageBounds)) {
    [super drawWithBox:box toContext:context];
    return;
  }

  CGContextSaveGState(context);
  [self transformContext:context forBox:box];
  CGContextClipToRect(context, pageBounds);

  CGContextSetBlendMode(context, kCGBlendModeNormal);
  CGContextSetAlpha(context, 1.0);
  CGContextSetFillColorWithColor(context, UIColor.whiteColor.CGColor);
  CGContextFillRect(context, pageBounds);
  CGContextDrawPDFPage(context, self.pageRef);

  PapyrusApplyPageTheme(theme, pageBounds, context);

  if (self.displaysAnnotations) {
    for (PDFAnnotation *annotation in self.annotations) {
      if (!annotation.shouldDisplay) continue;
      [annotation drawWithBox:box inContext:context];
    }
  }

  CGContextRestoreGState(context);
}

@end

void PapyrusInstallPdfPageThemeDelegate(PDFDocument *document) {
  (void)PapyrusThemeDelegateForDocument(document, YES);
}

NSString *PapyrusAcquirePdfPageThemeLease(PDFDocument *document, NSString *theme) {
  PapyrusPdfPageThemeDelegate *delegate =
      PapyrusThemeDelegateForDocument(document, YES);
  NSString *leaseToken = [[NSUUID UUID] UUIDString];
  [delegate setTheme:theme forLease:leaseToken];
  return leaseToken;
}

void PapyrusUpdatePdfPageThemeLease(PDFDocument *document,
                                    NSString *leaseToken,
                                    NSString *theme) {
  [PapyrusThemeDelegateForDocument(document, NO) setTheme:theme forLease:leaseToken];
}

void PapyrusReleasePdfPageThemeLease(PDFDocument *document, NSString *leaseToken) {
  [PapyrusThemeDelegateForDocument(document, NO) removeLease:leaseToken];
}
