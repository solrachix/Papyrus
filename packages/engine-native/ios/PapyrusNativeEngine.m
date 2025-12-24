#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTUIManager.h>
#import <PDFKit/PDFKit.h>

#import "PapyrusEngineStore.h"
#import "PapyrusPageView.h"

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusNativeEngine : NSObject <RCTBridgeModule>
@property (nonatomic, weak) RCTBridge *bridge;
@end

NS_ASSUME_NONNULL_END

@implementation PapyrusNativeEngine

RCT_EXPORT_MODULE(PapyrusNativeEngine)

static NSArray<NSDictionary *> *PapyrusBuildOutlineItems(PDFOutline *outline, PDFDocument *document) {
  if (!outline || !document) return @[];

  NSMutableArray<NSDictionary *> *items = [NSMutableArray array];
  NSInteger count = outline.numberOfChildren;
  for (NSInteger i = 0; i < count; i++) {
    PDFOutline *child = [outline childAtIndex:i];
    if (!child) continue;

    NSString *title = child.label ?: @"";
    NSInteger pageIndex = -1;
    PDFDestination *dest = child.destination;
    if (!dest && [child.action isKindOfClass:[PDFActionGoTo class]]) {
      dest = ((PDFActionGoTo *)child.action).destination;
    }
    if (dest.page) {
      pageIndex = [document indexForPage:dest.page];
    }

    NSArray<NSDictionary *> *children = PapyrusBuildOutlineItems(child, document);
    NSMutableDictionary *item = [NSMutableDictionary dictionaryWithCapacity:3];
    item[@"title"] = title;
    item[@"pageIndex"] = @(pageIndex);
    if (children.count > 0) {
      item[@"children"] = children;
    }
    [items addObject:item];
  }

  return items;
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(createEngine) {
  return [[PapyrusEngineStore shared] createEngine];
}

RCT_EXPORT_METHOD(destroyEngine:(NSString *)engineId) {
  [[PapyrusEngineStore shared] destroyEngine:engineId];
}

RCT_EXPORT_METHOD(load:(NSString *)engineId
                  source:(NSDictionary *)source
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSString *uri = source[@"uri"];
  id dataObject = source[@"data"];

  void (^loadFromData)(NSData *) = ^(NSData *data) {
    PDFDocument *document = [[PDFDocument alloc] initWithData:data];
    if (!document) {
      reject(@"papyrus_load_failed", @"Failed to open PDF document", nil);
      return;
    }
    [[PapyrusEngineStore shared] setDocument:document forEngine:engineId];
    resolve(@{@"pageCount": @(document.pageCount)});
  };

  if (uri && [uri isKindOfClass:[NSString class]]) {
    NSURL *url = [NSURL URLWithString:uri];
    if (!url) {
      reject(@"papyrus_invalid_uri", @"Invalid PDF URI", nil);
      return;
    }

    if ([uri hasPrefix:@"http://"] || [uri hasPrefix:@"https://"]) {
      NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithURL:url completionHandler:^(NSData *_Nullable data, NSURLResponse *_Nullable response, NSError *_Nullable error) {
        if (error || !data) {
          reject(@"papyrus_download_failed", @"Failed to download PDF", error);
          return;
        }
        loadFromData(data);
      }];
      [task resume];
      return;
    }

    NSData *data = [NSData dataWithContentsOfURL:url];
    if (!data) {
      reject(@"papyrus_read_failed", @"Failed to read PDF data from URI", nil);
      return;
    }
    loadFromData(data);
    return;
  }

  if ([dataObject isKindOfClass:[NSData class]]) {
    loadFromData((NSData *)dataObject);
    return;
  }

  if ([dataObject isKindOfClass:[NSArray class]]) {
    NSArray *array = (NSArray *)dataObject;
    NSUInteger length = array.count;
    NSMutableData *data = [NSMutableData dataWithLength:length];
    uint8_t *bytes = (uint8_t *)data.mutableBytes;
    for (NSUInteger i = 0; i < length; i++) {
      bytes[i] = (uint8_t)[array[i] intValue];
    }
    loadFromData(data);
    return;
  }

  reject(@"papyrus_invalid_source", @"Unsupported PDF source", nil);
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getPageCount:(NSString *)engineId) {
  PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
  if (!document) return @(0);
  return @(document.pageCount);
}

RCT_EXPORT_METHOD(renderPage:(NSString *)engineId
                  pageIndex:(NSInteger)pageIndex
                  target:(nonnull NSNumber *)target
                  scale:(CGFloat)scale
                  zoom:(CGFloat)zoom
                  rotation:(NSInteger)rotation) {
  dispatch_async(dispatch_get_main_queue(), ^{
    PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
    UIView *view = [self.bridge.uiManager viewForReactTag:target];
    if ([view isKindOfClass:[PapyrusPageView class]]) {
      PapyrusPageView *pageView = (PapyrusPageView *)view;
      [pageView renderWithDocument:document pageIndex:pageIndex scale:scale zoom:zoom rotation:rotation];
    }
  });
}

RCT_EXPORT_METHOD(renderTextLayer:(NSString *)engineId
                  pageIndex:(NSInteger)pageIndex
                  target:(nonnull NSNumber *)target
                  scale:(CGFloat)scale
                  zoom:(CGFloat)zoom
                  rotation:(NSInteger)rotation) {
  #pragma unused(engineId, pageIndex, target, scale, zoom, rotation)
}

RCT_EXPORT_METHOD(getTextContent:(NSString *)engineId
                  pageIndex:(NSInteger)pageIndex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
  PDFPage *page = [document pageAtIndex:pageIndex];
  if (!page) {
    resolve(@[]);
    return;
  }

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  PDFSelection *selection = [page selectionForRect:pageBounds];
  if (!selection) {
    resolve(@[]);
    return;
  }

  NSArray<PDFSelection *> *lines = [selection selectionsByLine];
  if (!lines || lines.count == 0) {
    lines = @[selection];
  }

  NSMutableArray *items = [NSMutableArray arrayWithCapacity:lines.count];
  for (PDFSelection *line in lines) {
    NSString *text = line.string ?: @"";
    if (text.length == 0) continue;
    CGRect bounds = [line boundsForPage:page];
    NSDictionary *item = @{
      @"str": text,
      @"dir": @"ltr",
      @"width": @(bounds.size.width),
      @"height": @(bounds.size.height),
      @"transform": @[@1, @0, @0, @1, @(bounds.origin.x), @(bounds.origin.y)],
      @"fontName": @""
    };
    [items addObject:item];
  }

  resolve(items);
}

RCT_EXPORT_METHOD(getPageDimensions:(NSString *)engineId
                  pageIndex:(NSInteger)pageIndex
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
  PDFPage *page = [document pageAtIndex:pageIndex];
  if (!page) {
    resolve(@{@"width": @(0), @"height": @(0)});
    return;
  }
  CGRect box = [page boundsForBox:kPDFDisplayBoxMediaBox];
  resolve(@{@"width": @(box.size.width), @"height": @(box.size.height)});
}

RCT_EXPORT_METHOD(getOutline:(NSString *)engineId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
  if (!document) {
    resolve(@[]);
    return;
  }

  PDFOutline *root = document.outlineRoot;
  if (!root) {
    resolve(@[]);
    return;
  }

  resolve(PapyrusBuildOutlineItems(root, document));
}

RCT_EXPORT_METHOD(getPageIndex:(NSString *)engineId
                  dest:(id)dest
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  #pragma unused(engineId, dest)
  resolve([NSNull null]);
}

RCT_EXPORT_METHOD(searchText:(NSString *)engineId
                  query:(NSString *)query
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
  if (!document || !query || query.length < 2) {
    resolve(@[]);
    return;
  }

  NSArray<PDFSelection *> *matches = [document findString:query withOptions:NSCaseInsensitiveSearch];
  if (!matches || matches.count == 0) {
    resolve(@[]);
    return;
  }

  NSMutableDictionary<NSNumber *, NSNumber *> *pageCounts = [NSMutableDictionary dictionary];
  NSMutableArray *results = [NSMutableArray arrayWithCapacity:matches.count];

  for (PDFSelection *selection in matches) {
    NSArray<PDFPage *> *pages = selection.pages;
    PDFPage *page = pages.firstObject;
    if (!page) continue;

    NSInteger pageIndex = [document indexForPage:page];
    NSNumber *pageKey = @(pageIndex);
    NSInteger matchIndex = [pageCounts[pageKey] integerValue];
    pageCounts[pageKey] = @(matchIndex + 1);

    CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
    CGFloat pageWidth = pageBounds.size.width;
    CGFloat pageHeight = pageBounds.size.height;

    NSArray<PDFSelection *> *lineSelections = [selection selectionsByLine];
    if (!lineSelections || lineSelections.count == 0) {
      lineSelections = @[selection];
    }

    NSMutableArray *rects = [NSMutableArray arrayWithCapacity:lineSelections.count];
    for (PDFSelection *line in lineSelections) {
      CGRect bounds = [line boundsForPage:page];
      if (CGRectIsEmpty(bounds) || pageWidth <= 0 || pageHeight <= 0) continue;

      CGFloat topLeftY = pageHeight - (bounds.origin.y + bounds.size.height);
      NSDictionary *rect = @{
        @"x": @(bounds.origin.x / pageWidth),
        @"y": @(topLeftY / pageHeight),
        @"width": @(bounds.size.width / pageWidth),
        @"height": @(bounds.size.height / pageHeight)
      };
      [rects addObject:rect];
    }

    NSDictionary *result = @{
      @"pageIndex": @(pageIndex),
      @"text": selection.string ?: @"",
      @"matchIndex": @(matchIndex),
      @"rects": rects
    };
    [results addObject:result];
  }

  resolve(results);
}

RCT_EXPORT_METHOD(selectText:(NSString *)engineId
                  pageIndex:(NSInteger)pageIndex
                  x:(CGFloat)x
                  y:(CGFloat)y
                  width:(CGFloat)width
                  height:(CGFloat)height
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
  if (!document || pageIndex < 0 || width <= 0 || height <= 0) {
    resolve([NSNull null]);
    return;
  }

  PDFPage *page = [document pageAtIndex:pageIndex];
  if (!page) {
    resolve([NSNull null]);
    return;
  }

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  CGFloat pageWidth = pageBounds.size.width;
  CGFloat pageHeight = pageBounds.size.height;
  if (pageWidth <= 0 || pageHeight <= 0) {
    resolve([NSNull null]);
    return;
  }

  CGFloat rectX = x * pageWidth;
  CGFloat rectW = width * pageWidth;
  CGFloat rectH = height * pageHeight;
  CGFloat rectTop = y * pageHeight;
  CGFloat rectY = pageHeight - rectTop - rectH;
  CGRect selectionRect = CGRectMake(rectX, rectY, rectW, rectH);

  PDFSelection *selection = [page selectionForRect:selectionRect];
  if (!selection) {
    resolve([NSNull null]);
    return;
  }

  NSArray<PDFSelection *> *lineSelections = [selection selectionsByLine];
  if (!lineSelections || lineSelections.count == 0) {
    lineSelections = @[selection];
  }

  NSMutableArray *rects = [NSMutableArray arrayWithCapacity:lineSelections.count];
  for (PDFSelection *line in lineSelections) {
    CGRect bounds = [line boundsForPage:page];
    if (CGRectIsEmpty(bounds)) continue;

    CGFloat topLeftY = pageHeight - (bounds.origin.y + bounds.size.height);
    NSDictionary *rect = @{
      @"x": @(bounds.origin.x / pageWidth),
      @"y": @(topLeftY / pageHeight),
      @"width": @(bounds.size.width / pageWidth),
      @"height": @(bounds.size.height / pageHeight)
    };
    [rects addObject:rect];
  }

  NSDictionary *result = @{
    @"text": selection.string ?: @"",
    @"rects": rects
  };
  resolve(result);
}

@end
