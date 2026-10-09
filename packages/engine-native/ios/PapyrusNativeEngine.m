#import "PapyrusTextAnnotationRange.h"
#import <Foundation/Foundation.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTUIManager.h>
#import <PDFKit/PDFKit.h>
#import <ImageIO/ImageIO.h>
#include <math.h>

static const unsigned long long kPapyrusMaximumTextSourceBytes = 64ULL * 1024ULL * 1024ULL;
static const unsigned long long kPapyrusMaximumComicArchiveBytes = 512ULL * 1024ULL * 1024ULL;

#import "PapyrusEngineStore.h"
#import "PapyrusPageView.h"
#import "PapyrusTextStore.h"
#import "../vendor/libarchive/PapyrusComicArchive.h"

static BOOL PapyrusIsWordCharacter(unichar value) {
  if (value >= '0' && value <= '9') return YES;
  if (value >= 'A' && value <= 'Z') return YES;
  if (value >= 'a' && value <= 'z') return YES;
  if (value == '\'' || value == 0x2019) return YES;
  if (value == '-') return YES;
  if (value >= 0x00C0 && value <= 0x00D6) return YES;
  if (value >= 0x00D8 && value <= 0x00F6) return YES;
  if (value >= 0x00F8 && value <= 0x00FF) return YES;
  if (value >= 0x0100 && value <= 0x017F) return YES;
  return NO;
}

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusNativeEngine : NSObject <RCTBridgeModule>
@property (nonatomic, weak) RCTBridge *bridge;
@end

NS_ASSUME_NONNULL_END

static NSMutableDictionary<NSString *, NSNumber *> *PapyrusPageViewTags;

static NSString *PapyrusViewKeyFor(NSString *engineId, NSInteger pageIndex) {
  return [NSString stringWithFormat:@"%@:%ld", engineId ?: @"", (long)pageIndex];
}

static void PapyrusEnsureViewTagStore(void) {
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    PapyrusPageViewTags = [NSMutableDictionary dictionary];
  });
}

static void PapyrusSyncOnMain(void (^block)(void)) {
  if ([NSThread isMainThread]) {
    block();
  } else {
    dispatch_sync(dispatch_get_main_queue(), block);
  }
}

static void PapyrusCleanupComicSources(NSString *engineId);

static NSString *PapyrusDecodeTextData(NSData *data, NSError **error) {
  if (data.length >= 4) {
    const uint8_t *bytes = data.bytes;
    if ((bytes[0] == 0xff && bytes[1] == 0xfe && bytes[2] == 0 && bytes[3] == 0) ||
        (bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 0xfe && bytes[3] == 0xff)) {
      if (error) *error = [NSError errorWithDomain:@"PapyrusText" code:1 userInfo:@{NSLocalizedDescriptionKey: @"UTF-32 text is not supported"}];
      return nil;
    }
  }
  NSStringEncoding encoding = NSUTF8StringEncoding;
  NSUInteger offset = 0;
  if (data.length >= 2) {
    const uint8_t *bytes = data.bytes;
    if (bytes[0] == 0xff && bytes[1] == 0xfe) {
      encoding = NSUTF16LittleEndianStringEncoding;
      offset = 2;
    } else if (bytes[0] == 0xfe && bytes[1] == 0xff) {
      encoding = NSUTF16BigEndianStringEncoding;
      offset = 2;
    } else if (data.length >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf) {
      offset = 3;
    }
  }
  NSData *payload = offset ? [data subdataWithRange:NSMakeRange(offset, data.length - offset)] : data;
  NSString *text = [[NSString alloc] initWithData:payload encoding:encoding];
  if (!text && error) {
    *error = [NSError errorWithDomain:@"PapyrusText" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Invalid or unsupported text encoding"}];
  }
  return text;
}

static BOOL PapyrusFileURLExceedsLimit(NSURL *url, unsigned long long limit) {
  NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:url.path error:nil];
  NSNumber *fileSize = attributes[NSFileSize];
  return fileSize && fileSize.unsignedLongLongValue > limit;
}

typedef void (^PapyrusBoundedDownloadCompletion)(NSURL * _Nullable fileURL, NSURLResponse * _Nullable response, NSError * _Nullable error);

@interface PapyrusBoundedDownload : NSObject <NSURLSessionDownloadDelegate>
@property (nonatomic, assign) unsigned long long maximumBytes;
@property (nonatomic, strong) NSURLSession *session;
@property (nonatomic, copy) PapyrusBoundedDownloadCompletion completion;
@property (nonatomic, strong, nullable) NSURL *stagedURL;
@property (nonatomic, strong, nullable) NSURLResponse *response;
@property (nonatomic, strong, nullable) NSError *stagingError;
@property (nonatomic, assign) BOOL exceededLimit;
- (void)startURL:(NSURL *)url maximumBytes:(unsigned long long)maximumBytes completion:(PapyrusBoundedDownloadCompletion)completion;
@end

@implementation PapyrusBoundedDownload
- (void)startURL:(NSURL *)url maximumBytes:(unsigned long long)maximumBytes completion:(PapyrusBoundedDownloadCompletion)completion {
  self.maximumBytes = maximumBytes;
  self.completion = completion;
  NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.defaultSessionConfiguration;
  self.session = [NSURLSession sessionWithConfiguration:configuration delegate:self delegateQueue:nil];
  [[self.session downloadTaskWithURL:url] resume];
}

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask didWriteData:(int64_t)bytesWritten totalBytesWritten:(int64_t)totalBytesWritten totalBytesExpectedToWrite:(int64_t)totalBytesExpectedToWrite {
  #pragma unused(session, bytesWritten, totalBytesExpectedToWrite)
  if (totalBytesWritten > 0 && (unsigned long long)totalBytesWritten > self.maximumBytes) {
    self.exceededLimit = YES;
    [downloadTask cancel];
  }
}

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask didFinishDownloadingToURL:(NSURL *)location {
  #pragma unused(session)
  self.response = downloadTask.response;
  if ([self.response isKindOfClass:NSHTTPURLResponse.class] && ((NSHTTPURLResponse *)self.response).statusCode >= 400) {
    self.stagingError = [NSError errorWithDomain:@"PapyrusDownload" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Remote server returned an error"}];
    return;
  }
  if (self.exceededLimit || PapyrusFileURLExceedsLimit(location, self.maximumBytes)) {
    self.exceededLimit = YES;
    return;
  }
  NSURL *destination = [NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"papyrus-download-%@.tmp", NSUUID.UUID.UUIDString]]];
  NSError *error = nil;
  if ([[NSFileManager defaultManager] copyItemAtURL:location toURL:destination error:&error]) {
    self.stagedURL = destination;
  } else {
    self.stagingError = error;
  }
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  #pragma unused(session)
  self.response = task.response ?: self.response;
  NSError *resultError = error ?: self.stagingError;
  if (self.exceededLimit) {
    resultError = [NSError errorWithDomain:@"PapyrusDownload" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Download exceeds the configured size limit"}];
    if (self.stagedURL) [[NSFileManager defaultManager] removeItemAtURL:self.stagedURL error:nil];
    self.stagedURL = nil;
  }
  PapyrusBoundedDownloadCompletion completion = self.completion;
  self.completion = nil;
  if (completion) completion(self.stagedURL, self.response, resultError);
  if (self.stagedURL) [[NSFileManager defaultManager] removeItemAtURL:self.stagedURL error:nil];
  self.stagedURL = nil;
  [self.session finishTasksAndInvalidate];
}
@end

static void PapyrusDownloadURLWithLimit(NSURL *url, unsigned long long maximumBytes, PapyrusBoundedDownloadCompletion completion) {
  PapyrusBoundedDownload *download = [[PapyrusBoundedDownload alloc] init];
  [download startURL:url maximumBytes:maximumBytes completion:completion];
}

static void PapyrusAppendTextMappingSegment(NSMutableArray<NSMutableDictionary *> * _Nullable segments,
                                           NSUInteger normalizedStart,
                                           NSUInteger normalizedLength,
                                           NSRange sourceRange) {
  if (!segments || normalizedLength == 0) return;
  BOOL linear = normalizedLength == 1 && sourceRange.length == 1;
  NSMutableDictionary *previous = segments.lastObject;
  if (linear && [previous[@"linear"] boolValue] &&
      [previous[@"normalizedStart"] unsignedIntegerValue] + [previous[@"normalizedLength"] unsignedIntegerValue] == normalizedStart &&
      [previous[@"sourceEnd"] unsignedIntegerValue] == sourceRange.location) {
    previous[@"normalizedLength"] = @([previous[@"normalizedLength"] unsignedIntegerValue] + 1);
    previous[@"sourceEnd"] = @(NSMaxRange(sourceRange));
    return;
  }
  [segments addObject:[@{
    @"normalizedStart": @(normalizedStart),
    @"normalizedLength": @(normalizedLength),
    @"sourceStart": @(sourceRange.location),
    @"sourceEnd": @(NSMaxRange(sourceRange)),
    @"linear": @(linear)
  } mutableCopy]];
}

static NSDictionary *PapyrusSourceRangeForNormalizedOffset(NSArray<NSDictionary *> *segments,
                                                             NSUInteger normalizedOffset) {
  NSInteger low = 0;
  NSInteger high = (NSInteger)segments.count - 1;
  while (low <= high) {
    NSInteger middle = (low + high) / 2;
    NSDictionary *segment = segments[(NSUInteger)middle];
    NSUInteger start = [segment[@"normalizedStart"] unsignedIntegerValue];
    NSUInteger length = [segment[@"normalizedLength"] unsignedIntegerValue];
    if (normalizedOffset < start) {
      high = middle - 1;
    } else if (normalizedOffset >= start + length) {
      low = middle + 1;
    } else if ([segment[@"linear"] boolValue]) {
      NSUInteger sourceOffset = [segment[@"sourceStart"] unsignedIntegerValue] + normalizedOffset - start;
      return @{@"start": @(sourceOffset), @"end": @(sourceOffset + 1)};
    } else {
      return @{@"start": segment[@"sourceStart"], @"end": segment[@"sourceEnd"]};
    }
  }
  return @{@"start": @0, @"end": @0};
}

static NSString *PapyrusNormalizeSearchText(NSString *source, NSMutableArray<NSMutableDictionary *> * _Nullable sourceRanges) {
  if (!source) return @"";
  NSMutableString *normalized = [NSMutableString string];
  NSCharacterSet *spaceSet = NSCharacterSet.whitespaceAndNewlineCharacterSet;
  NSRange pendingWhitespace = NSMakeRange(NSNotFound, 0);
  NSUInteger cursor = 0;
  while (cursor < source.length) {
    NSRange clusterRange = [source rangeOfComposedCharacterSequenceAtIndex:cursor];
    NSString *cluster = [source substringWithRange:clusterRange];
    cursor = NSMaxRange(clusterRange);
    if ([cluster rangeOfCharacterFromSet:spaceSet.invertedSet].location == NSNotFound) {
      if (pendingWhitespace.location == NSNotFound) pendingWhitespace = clusterRange;
      else pendingWhitespace.length = NSMaxRange(clusterRange) - pendingWhitespace.location;
      continue;
    }
    if (pendingWhitespace.location != NSNotFound && normalized.length > 0) {
      NSUInteger normalizedStart = normalized.length;
      [normalized appendString:@" "];
      PapyrusAppendTextMappingSegment(sourceRanges, normalizedStart, 1, pendingWhitespace);
    }
    pendingWhitespace = NSMakeRange(NSNotFound, 0);
    NSString *folded = [cluster stringByFoldingWithOptions:NSDiacriticInsensitiveSearch | NSCaseInsensitiveSearch locale:[NSLocale localeWithLocaleIdentifier:@"en_US_POSIX"]];
    NSUInteger normalizedStart = normalized.length;
    [normalized appendString:folded];
    PapyrusAppendTextMappingSegment(sourceRanges, normalizedStart, folded.length, clusterRange);
  }
  if (pendingWhitespace.location != NSNotFound && normalized.length > 0) {
    NSUInteger normalizedStart = normalized.length;
    [normalized appendString:@" "];
    PapyrusAppendTextMappingSegment(sourceRanges, normalizedStart, 1, pendingWhitespace);
  }
  return normalized;
}

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

@implementation PapyrusNativeEngine

RCT_EXPORT_MODULE(PapyrusNativeEngine)

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(createEngine) {
  return [[PapyrusEngineStore shared] createEngine];
}

RCT_EXPORT_METHOD(destroyEngine:(NSString *)engineId) {
  [[PapyrusEngineStore shared] destroyEngine:engineId];
  [[PapyrusTextStore shared] closeEngineId:engineId];
  papyrus_comic_close_engine(engineId.UTF8String);
  PapyrusCleanupComicSources(engineId);
}

static NSString *PapyrusComicCacheDirectory(void) {
  NSURL *caches = [[NSFileManager defaultManager] URLsForDirectory:NSCachesDirectory inDomains:NSUserDomainMask].firstObject;
  NSURL *directory = [caches URLByAppendingPathComponent:@"PapyrusComicPages" isDirectory:YES];
  [[NSFileManager defaultManager] createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
  return directory.path;
}

static NSString *PapyrusComicArchiveDirectory(void) {
  NSString *directory = [PapyrusComicCacheDirectory() stringByAppendingPathComponent:@"archives"];
  [[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil];
  return directory;
}

static NSString *PapyrusComicThumbnailsDirectory(void) {
  NSString *directory = [PapyrusComicCacheDirectory() stringByAppendingPathComponent:@"thumbnails"];
  [[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil];
  return directory;
}

static NSLock *PapyrusComicThumbnailCacheLock(void) {
  static NSLock *lock;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ lock = [[NSLock alloc] init]; });
  return lock;
}

static void PapyrusPruneComicThumbnailCache(NSString *preservePath) {
  NSString *directory = PapyrusComicThumbnailsDirectory();
  NSArray<NSString *> *names = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:directory error:nil] ?: @[];
  NSMutableArray<NSDictionary *> *files = [NSMutableArray array];
  unsigned long long totalBytes = 0;
  for (NSString *name in names) {
    NSString *path = [directory stringByAppendingPathComponent:name];
    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:nil];
    if (![attributes[NSFileType] isEqualToString:NSFileTypeRegular]) continue;
    unsigned long long size = [attributes[NSFileSize] unsignedLongLongValue];
    totalBytes += size;
    [files addObject:@{ @"path": path, @"size": @(size), @"date": attributes[NSFileModificationDate] ?: [NSDate distantPast] }];
  }
  [files sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
    return [left[@"date"] compare:right[@"date"]];
  }];
  const unsigned long long maximumBytes = 16ULL * 1024ULL * 1024ULL;
  for (NSDictionary *file in files) {
    if (totalBytes <= maximumBytes) break;
    NSString *path = file[@"path"];
    if ([path isEqualToString:preservePath]) continue;
    if ([[NSFileManager defaultManager] removeItemAtPath:path error:nil]) totalBytes -= [file[@"size"] unsignedLongLongValue];
  }
}

static NSMutableDictionary<NSString *, NSString *> *PapyrusComicStagedSourceStore(void) {
  static NSMutableDictionary<NSString *, NSString *> *store;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ store = [NSMutableDictionary dictionary]; });
  return store;
}

static NSString *PapyrusComicSourceKey(NSString *engineId, NSInteger generation) {
  return [NSString stringWithFormat:@"%@:%ld", engineId ?: @"", (long)generation];
}

static void PapyrusRememberComicSource(NSString *path, NSString *engineId, NSInteger generation) {
  @synchronized (PapyrusComicStagedSourceStore()) {
    PapyrusComicStagedSourceStore()[PapyrusComicSourceKey(engineId, generation)] = path;
  }
}

static void PapyrusCleanupComicSources(NSString *engineId) {
  NSMutableArray<NSString *> *paths = [NSMutableArray array];
  NSString *prefix = [NSString stringWithFormat:@"%@:", engineId ?: @""];
  @synchronized (PapyrusComicStagedSourceStore()) {
    NSArray<NSString *> *keys = PapyrusComicStagedSourceStore().allKeys;
    for (NSString *key in keys) {
      if ([key hasPrefix:prefix]) {
        NSString *path = PapyrusComicStagedSourceStore()[key];
        if (path) [paths addObject:path];
        [PapyrusComicStagedSourceStore() removeObjectForKey:key];
      }
    }
  }
  for (NSString *path in paths) [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
}

static NSData *PapyrusDataFromComicSource(NSDictionary *source, NSError **error) {
  id dataObject = source[@"data"];
  if ([dataObject isKindOfClass:[NSData class]]) return dataObject;
  if ([dataObject isKindOfClass:[NSArray class]]) {
    NSArray *array = dataObject;
    NSMutableData *data = [NSMutableData dataWithLength:array.count];
    uint8_t *bytes = data.mutableBytes;
    for (NSUInteger i = 0; i < array.count; i++) bytes[i] = [array[i] unsignedCharValue];
    return data;
  }
  return nil;
}

RCT_EXPORT_METHOD(loadComic:(NSString *)engineId
                  generation:(NSInteger)generation
                  source:(NSDictionary *)source
                  format:(NSString *)format
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  #pragma unused(format)
  void (^openPath)(NSString *, BOOL) = ^(NSString *path, BOOL ownsPath) {
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      int count = 0;
      char message[512] = {};
      NSString *cache = PapyrusComicCacheDirectory();
      BOOL opened = papyrus_comic_open(engineId.UTF8String, (int)generation, path.UTF8String, cache.UTF8String, &count, message, sizeof(message));
      if (opened && ownsPath) PapyrusRememberComicSource(path, engineId, generation);
      else if (!opened && ownsPath) [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
      NSString *reason = message[0] ? [NSString stringWithUTF8String:message] : @"Unable to open comic archive";
      dispatch_async(dispatch_get_main_queue(), ^{
        if (!opened) {
          reject(@"papyrus_comic_load_failed", reason, nil);
        } else {
          resolve(@{@"pageCount": @(count)});
        }
      });
    });
  };

  NSString *uri = source[@"uri"];
  if ([uri isKindOfClass:[NSString class]]) {
    if ([uri hasPrefix:@"http://"] || [uri hasPrefix:@"https://"]) {
      NSURL *url = [NSURL URLWithString:uri];
      PapyrusDownloadURLWithLimit(url, kPapyrusMaximumComicArchiveBytes, ^(NSURL *downloadedURL, NSURLResponse *response, NSError *error) {
        if (error || !downloadedURL) {
          BOOL tooLarge = [error.domain isEqualToString:@"PapyrusDownload"] && error.code == 1;
          reject(tooLarge ? @"papyrus_comic_too_large" : @"papyrus_comic_download_failed",
                 tooLarge ? @"Comic archive exceeds the 512 MiB limit" : @"Failed to download comic archive", error);
          return;
        }
        if ([response isKindOfClass:NSHTTPURLResponse.class] && ((NSHTTPURLResponse *)response).statusCode >= 400) {
          reject(@"papyrus_comic_download_failed", @"Comic server returned an error", nil);
          return;
        }
        if ((response.expectedContentLength > 0 && (unsigned long long)response.expectedContentLength > kPapyrusMaximumComicArchiveBytes) ||
            PapyrusFileURLExceedsLimit(downloadedURL, kPapyrusMaximumComicArchiveBytes)) {
          reject(@"papyrus_comic_too_large", @"Comic archive exceeds the 512 MiB limit", nil);
          return;
        }
        NSString *path = [PapyrusComicArchiveDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"papyrus-comic-%@-%ld.cbz", NSUUID.UUID.UUIDString, (long)generation]];
        NSError *copyError = nil;
        if (![[NSFileManager defaultManager] copyItemAtURL:downloadedURL toURL:[NSURL fileURLWithPath:path] error:&copyError]) {
          reject(@"papyrus_comic_write_failed", @"Failed to stage comic archive", copyError);
          return;
        }
        openPath(path, YES);
      });
      return;
    }
    NSURL *url = [uri hasPrefix:@"file://"] ? [NSURL URLWithString:uri] : [NSURL fileURLWithPath:uri];
    if (url.isFileURL) {
      BOOL hasScope = [url startAccessingSecurityScopedResource];
      if (PapyrusFileURLExceedsLimit(url, kPapyrusMaximumComicArchiveBytes)) {
        if (hasScope) [url stopAccessingSecurityScopedResource];
        reject(@"papyrus_comic_too_large", @"Comic archive exceeds the 512 MiB limit", nil);
        return;
      }
      NSString *staged = [PapyrusComicArchiveDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"papyrus-comic-%@-%ld.%@", NSUUID.UUID.UUIDString, (long)generation, uri.pathExtension.length ? uri.pathExtension : @"archive"]];
      NSError *copyError = nil;
      BOOL copied = [[NSFileManager defaultManager] copyItemAtURL:url toURL:[NSURL fileURLWithPath:staged] error:&copyError];
      if (hasScope) [url stopAccessingSecurityScopedResource];
      if (!copied) {
        reject(@"papyrus_comic_stage_failed", @"Failed to copy comic archive into app cache", copyError);
        return;
      }
      openPath(staged, YES);
      return;
    }
  }

  id sourceData = source[@"data"];
  if ([sourceData isKindOfClass:NSData.class] && [sourceData length] > kPapyrusMaximumComicArchiveBytes) {
    reject(@"papyrus_comic_too_large", @"Comic archive exceeds the 512 MiB limit", nil);
    return;
  }
  if ([sourceData isKindOfClass:NSArray.class] && [sourceData count] > kPapyrusMaximumComicArchiveBytes) {
    reject(@"papyrus_comic_too_large", @"Comic archive exceeds the 512 MiB limit", nil);
    return;
  }
  NSError *error = nil;
  NSData *data = PapyrusDataFromComicSource(source, &error);
  if (!data) {
    reject(@"papyrus_comic_invalid_source", @"Unsupported comic archive source", error);
    return;
  }
  NSString *path = [PapyrusComicArchiveDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"papyrus-comic-%@-%ld.cbz", NSUUID.UUID.UUIDString, (long)generation]];
  if (![data writeToFile:path options:NSDataWritingAtomic error:&error]) {
    reject(@"papyrus_comic_write_failed", @"Failed to stage comic archive", error);
    return;
  }
  openPath(path, YES);
}

RCT_EXPORT_METHOD(closeComic:(NSString *)engineId generation:(NSInteger)generation) {
  papyrus_comic_close(engineId.UTF8String, (int)generation);
  NSString *key = PapyrusComicSourceKey(engineId, generation);
  NSString *path = nil;
  @synchronized (PapyrusComicStagedSourceStore()) {
    path = PapyrusComicStagedSourceStore()[key];
    [PapyrusComicStagedSourceStore() removeObjectForKey:key];
  }
  if (path) [[NSFileManager defaultManager] removeItemAtPath:path error:nil];
}

RCT_EXPORT_METHOD(getComicPagePreview:(NSString *)engineId
                  generation:(NSInteger)generation
                  pageIndex:(NSInteger)pageIndex
                  maxEdge:(NSInteger)maxEdge
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    char path[4096] = {};
    char message[512] = {};
    if (!papyrus_comic_extract_page(engineId.UTF8String, (int)generation, (int)pageIndex, path, sizeof(path), message, sizeof(message))) {
      dispatch_async(dispatch_get_main_queue(), ^{ resolve(NSNull.null); });
      return;
    }
    NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
    NSInteger boundedMaxEdge = MAX(64, MIN(1024, maxEdge));
    NSString *thumbnailDirectory = PapyrusComicThumbnailsDirectory();
    NSString *thumbnailName = [NSString stringWithFormat:@"%@-%ld.jpg", url.lastPathComponent, (long)boundedMaxEdge];
    NSString *thumbnailPath = [thumbnailDirectory stringByAppendingPathComponent:thumbnailName];
    [PapyrusComicThumbnailCacheLock() lock];
    NSDictionary *cachedAttributes = [[NSFileManager defaultManager] attributesOfItemAtPath:thumbnailPath error:nil];
    if ([cachedAttributes[NSFileSize] unsignedLongLongValue] > 0) {
      [[NSFileManager defaultManager] setAttributes:@{NSFileModificationDate: NSDate.date} ofItemAtPath:thumbnailPath error:nil];
      NSString *cachedURI = [NSURL fileURLWithPath:thumbnailPath].absoluteString;
      [PapyrusComicThumbnailCacheLock() unlock];
      dispatch_async(dispatch_get_main_queue(), ^{ resolve(cachedURI); });
      return;
    }
    CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
    if (!source) {
      [PapyrusComicThumbnailCacheLock() unlock];
      dispatch_async(dispatch_get_main_queue(), ^{ resolve(NSNull.null); });
      return;
    }
    NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
    NSUInteger sourceWidth = [properties[(id)kCGImagePropertyPixelWidth] unsignedIntegerValue];
    NSUInteger sourceHeight = [properties[(id)kCGImagePropertyPixelHeight] unsignedIntegerValue];
    if (sourceWidth == 0 || sourceHeight == 0 || sourceWidth > 20000 || sourceHeight > 20000 || sourceWidth * sourceHeight > 80000000ULL) {
      CFRelease(source);
      [PapyrusComicThumbnailCacheLock() unlock];
      dispatch_async(dispatch_get_main_queue(), ^{ resolve(NSNull.null); });
      return;
    }
    NSDictionary *options = @{
      (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
      (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize: @(boundedMaxEdge),
      (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform: @YES,
    };
    CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
    CFRelease(source);
    if (!image) {
      [PapyrusComicThumbnailCacheLock() unlock];
      dispatch_async(dispatch_get_main_queue(), ^{ resolve(NSNull.null); });
      return;
    }
    NSURL *thumbnailURL = [NSURL fileURLWithPath:thumbnailPath];
    CGImageDestinationRef destination = CGImageDestinationCreateWithURL((__bridge CFURLRef)thumbnailURL, CFSTR("public.jpeg"), 1, NULL);
    if (destination) {
      CGImageDestinationAddImage(destination, image, (__bridge CFDictionaryRef)@{(__bridge NSString *)kCGImageDestinationLossyCompressionQuality: @0.82});
    }
    BOOL wroteThumbnail = destination && CGImageDestinationFinalize(destination);
    if (destination) CFRelease(destination);
    CGImageRelease(image);
    if (!wroteThumbnail) [[NSFileManager defaultManager] removeItemAtPath:thumbnailPath error:nil];
    else PapyrusPruneComicThumbnailCache(thumbnailPath);
    NSString *result = wroteThumbnail ? thumbnailURL.absoluteString : nil;
    [PapyrusComicThumbnailCacheLock() unlock];
    dispatch_async(dispatch_get_main_queue(), ^{ resolve(result ?: (id)NSNull.null); });
  });
}

RCT_EXPORT_METHOD(readFileChunk:(NSString *)uriValue
                  offset:(nonnull NSNumber *)offsetValue
                  length:(nonnull NSNumber *)lengthValue
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  NSUInteger length = lengthValue.unsignedIntegerValue;
  if (length == 0 || length > 4 * 1024 * 1024) {
    reject(@"papyrus_file_chunk_failed", @"Invalid file chunk length", nil);
    return;
  }

  NSURL *url = [NSURL URLWithString:uriValue];
  if (!url.isFileURL) {
    reject(@"papyrus_file_chunk_failed", @"Unsupported local file URI", nil);
    return;
  }

  NSError *error = nil;
  NSFileHandle *file = [NSFileHandle fileHandleForReadingFromURL:url error:&error];
  if (!file) {
    reject(@"papyrus_file_chunk_failed", @"Failed to open local file", error);
    return;
  }

  @try {
    [file seekToFileOffset:offsetValue.unsignedLongLongValue];
    NSData *data = [file readDataOfLength:length];
    [file closeFile];
    resolve(@{
      @"data": [data base64EncodedStringWithOptions:0],
      @"done": @(data.length < length),
    });
  } @catch (NSException *exception) {
    [file closeFile];
    reject(@"papyrus_file_chunk_failed", exception.reason ?: @"Failed to read local file", nil);
  }
}

RCT_EXPORT_METHOD(loadText:(NSString *)engineId
                  generation:(NSInteger)generation
                  source:(NSDictionary *)source
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  void (^finishWithData)(NSData *) = ^(NSData *data) {
    if (data.length > kPapyrusMaximumTextSourceBytes) {
      reject(@"papyrus_text_too_large", @"TXT source exceeds the 64 MiB limit", nil);
      return;
    }
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      NSError *error = nil;
      NSString *text = PapyrusDecodeTextData(data, &error);
      dispatch_async(dispatch_get_main_queue(), ^{
        if (!text) {
          reject(@"papyrus_text_decode_failed", error.localizedDescription ?: @"Unsupported text encoding", error);
          return;
        }
        [[PapyrusTextStore shared] setText:text engineId:engineId generation:generation];
        resolve(@{@"textLength": @(text.length)});
      });
    });
  };

  NSString *plainText = source[@"text"];
  if ([plainText isKindOfClass:[NSString class]]) {
    if ([plainText lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > kPapyrusMaximumTextSourceBytes) {
      reject(@"papyrus_text_too_large", @"TXT source exceeds the 64 MiB limit", nil);
      return;
    }
    NSData *data = [plainText dataUsingEncoding:NSUTF8StringEncoding];
    if (data) finishWithData(data);
    else reject(@"papyrus_text_decode_failed", @"Failed to encode text source", nil);
    return;
  }

  NSString *uriValue = source[@"uri"];
  if ([uriValue isKindOfClass:[NSString class]]) {
    NSURL *url = [NSURL URLWithString:uriValue];
    if (!url) {
      reject(@"papyrus_text_invalid_uri", @"Invalid text URI", nil);
      return;
    }
    if ([uriValue hasPrefix:@"http://"] || [uriValue hasPrefix:@"https://"]) {
      PapyrusDownloadURLWithLimit(url, kPapyrusMaximumTextSourceBytes, ^(NSURL *downloadedURL, NSURLResponse *response, NSError *error) {
        if (error || !downloadedURL) {
          BOOL tooLarge = [error.domain isEqualToString:@"PapyrusDownload"] && error.code == 1;
          reject(tooLarge ? @"papyrus_text_too_large" : @"papyrus_text_read_failed",
                 tooLarge ? @"TXT source exceeds the 64 MiB limit" : @"Failed to download text", error);
          return;
        }
        if ((response.expectedContentLength > 0 && (unsigned long long)response.expectedContentLength > kPapyrusMaximumTextSourceBytes) ||
            PapyrusFileURLExceedsLimit(downloadedURL, kPapyrusMaximumTextSourceBytes)) {
          reject(@"papyrus_text_too_large", @"TXT source exceeds the 64 MiB limit", nil);
          return;
        }
        NSData *data = [NSData dataWithContentsOfURL:downloadedURL options:NSDataReadingMappedIfSafe error:nil];
        if (!data) {
          reject(@"papyrus_text_read_failed", @"Failed to read downloaded text", nil);
          return;
        }
        finishWithData(data);
      });
      return;
    }
    if (url.isFileURL) {
      BOOL hasScope = [url startAccessingSecurityScopedResource];
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSData *data = nil;
        BOOL tooLarge = PapyrusFileURLExceedsLimit(url, kPapyrusMaximumTextSourceBytes);
        if (!tooLarge) data = [NSData dataWithContentsOfURL:url options:NSDataReadingMappedIfSafe error:nil];
        if (hasScope) [url stopAccessingSecurityScopedResource];
        if (tooLarge) {
          dispatch_async(dispatch_get_main_queue(), ^{
            reject(@"papyrus_text_too_large", @"TXT source exceeds the 64 MiB limit", nil);
          });
        } else if (!data) {
          dispatch_async(dispatch_get_main_queue(), ^{
            reject(@"papyrus_text_read_failed", @"Failed to read text from URI", nil);
          });
        } else {
          finishWithData(data);
        }
      });
      return;
    }
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      NSData *data = [NSData dataWithContentsOfURL:url options:NSDataReadingMappedIfSafe error:nil];
      if (!data) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"papyrus_text_read_failed", @"Failed to read text from URI", nil);
        });
      } else {
        finishWithData(data);
      }
    });
    return;
  }

  id dataObject = source[@"data"];
  if ([dataObject isKindOfClass:[NSData class]]) {
    if ([dataObject length] > kPapyrusMaximumTextSourceBytes) {
      reject(@"papyrus_text_too_large", @"TXT source exceeds the 64 MiB limit", nil);
      return;
    }
    finishWithData(dataObject);
    return;
  }
  if ([dataObject isKindOfClass:[NSArray class]]) {
    NSArray *array = dataObject;
    if (array.count > kPapyrusMaximumTextSourceBytes) {
      reject(@"papyrus_text_too_large", @"TXT source exceeds the 64 MiB limit", nil);
      return;
    }
    NSMutableData *data = [NSMutableData dataWithLength:array.count];
    uint8_t *bytes = data.mutableBytes;
    for (NSUInteger i = 0; i < array.count; i++) bytes[i] = [array[i] unsignedCharValue];
    finishWithData(data);
    return;
  }
  reject(@"papyrus_text_invalid_source", @"Unsupported TXT source", nil);
}

RCT_EXPORT_METHOD(closeText:(NSString *)engineId generation:(NSInteger)generation) {
  [[PapyrusTextStore shared] closeEngineId:engineId generation:generation];
}

RCT_EXPORT_METHOD(getTextRange:(NSString *)engineId
                  generation:(NSInteger)generation
                  start:(NSInteger)start
                  end:(NSInteger)end
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  #pragma unused(reject)
  NSString *text = [[PapyrusTextStore shared] textForEngineId:engineId generation:generation];
  if (!text || start < 0 || end < start || end > text.length) {
    resolve(@"");
    return;
  }
  resolve([text substringWithRange:NSMakeRange((NSUInteger)start, (NSUInteger)(end - start))]);
}

RCT_EXPORT_METHOD(resolveTextAnnotationRange:(NSString *)engineId
                  generation:(NSInteger)generation
                  anchor:(NSDictionary *)anchor
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  #pragma unused(reject)
  NSString *text = [[PapyrusTextStore shared] textForEngineId:engineId generation:generation];
  NSRange range = text ? PapyrusResolveTextAnnotationRange(text,anchor) : NSMakeRange(NSNotFound,0);
  resolve(range.location == NSNotFound ? (id)kCFNull : @{@"start":@(range.location),@"end":@(NSMaxRange(range))});
}

RCT_EXPORT_METHOD(searchTextRanges:(NSString *)engineId
                  generation:(NSInteger)generation
                  query:(NSString *)query
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  #pragma unused(reject)
  NSString *text = [[PapyrusTextStore shared] textForEngineId:engineId generation:generation];
  if (!text || query.length == 0) {
    resolve(@[]);
    return;
  }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSMutableArray<NSMutableDictionary *> *sourceRanges = [NSMutableArray array];
    NSString *normalizedSource = PapyrusNormalizeSearchText(text, sourceRanges);
    NSString *normalizedQuery = [PapyrusNormalizeSearchText(query, nil) stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (normalizedQuery.length == 0 || normalizedSource.length < normalizedQuery.length) {
      resolve(@[]);
      return;
    }
    NSMutableArray<NSDictionary *> *results = [NSMutableArray array];
    NSUInteger cursor = 0;
    while (cursor < normalizedSource.length && results.count < 10000) {
      NSRange searchRange = NSMakeRange(cursor, normalizedSource.length - cursor);
      NSRange found = [normalizedSource rangeOfString:normalizedQuery options:NSLiteralSearch range:searchRange];
      if (found.location == NSNotFound) break;
      NSDictionary *first = PapyrusSourceRangeForNormalizedOffset(sourceRanges, found.location);
      NSDictionary *last = PapyrusSourceRangeForNormalizedOffset(sourceRanges, NSMaxRange(found) - 1);
      NSInteger start = [first[@"start"] integerValue];
      NSInteger end = [last[@"end"] integerValue];
      if (end > start && end <= text.length) {
        [results addObject:@{
          @"kind": @"text",
          @"location": @{@"kind": @"textRange", @"start": @(start), @"end": @(end)},
          @"text": [text substringWithRange:NSMakeRange((NSUInteger)start, (NSUInteger)(end - start))],
          @"matchIndex": @(results.count)
        }];
      }
      cursor = found.location + 1;
    }
    resolve(results);
  });
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
                  rotation:(NSInteger)rotation
                  requestId:(NSString *)requestId
                  telemetryContext:(NSDictionary *)telemetryContext) {
  #pragma unused(requestId, telemetryContext)
  dispatch_async(dispatch_get_main_queue(), ^{
    PDFDocument *document = [[PapyrusEngineStore shared] documentForEngine:engineId];
    UIView *view = [self.bridge.uiManager viewForReactTag:target];
    if ([view isKindOfClass:[PapyrusPageView class]]) {
      PapyrusPageView *pageView = (PapyrusPageView *)view;
      PapyrusEnsureViewTagStore();
      NSString *key = PapyrusViewKeyFor(engineId, pageIndex);
      @synchronized (PapyrusPageViewTags) {
        PapyrusPageViewTags[key] = target;
      }
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

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
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
  CGRect box = [page boundsForBox:kPDFDisplayBoxCropBox];
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

    CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
    CGFloat pageWidth = pageBounds.size.width;
    CGFloat pageHeight = pageBounds.size.height;
    CGFloat pageOriginX = pageBounds.origin.x;
    CGFloat pageOriginY = pageBounds.origin.y;

    NSArray<PDFSelection *> *lineSelections = [selection selectionsByLine];
    if (!lineSelections || lineSelections.count == 0) {
      lineSelections = @[selection];
    }

    NSMutableArray *rects = [NSMutableArray arrayWithCapacity:lineSelections.count];
    for (PDFSelection *line in lineSelections) {
      CGRect bounds = [line boundsForPage:page];
      if (CGRectIsEmpty(bounds) || pageWidth <= 0 || pageHeight <= 0) continue;

      CGFloat topLeftY = (pageOriginY + pageHeight) - (bounds.origin.y + bounds.size.height);
      NSDictionary *rect = @{
        @"x": @((bounds.origin.x - pageOriginX) / pageWidth),
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
                  startX:(CGFloat)startX
                  startY:(CGFloat)startY
                  endX:(CGFloat)endX
                  endY:(CGFloat)endY
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

  CGRect pageBounds = [page boundsForBox:kPDFDisplayBoxCropBox];
  CGFloat pageWidth = pageBounds.size.width;
  CGFloat pageHeight = pageBounds.size.height;
  CGFloat pageOriginX = pageBounds.origin.x;
  CGFloat pageOriginY = pageBounds.origin.y;
  if (pageWidth <= 0 || pageHeight <= 0) {
    resolve([NSNull null]);
    return;
  }

  CGRect selectionRect = CGRectZero;
  __block PapyrusPageView *pageView = nil;
  __block CGSize viewSize = CGSizeZero;
  PapyrusEnsureViewTagStore();
  NSString *key = PapyrusViewKeyFor(engineId, pageIndex);
  NSNumber *viewTag = nil;
  @synchronized (PapyrusPageViewTags) {
    viewTag = PapyrusPageViewTags[key];
  }

  if (viewTag) {
    PapyrusSyncOnMain(^{
      UIView *view = [self.bridge.uiManager viewForReactTag:viewTag];
      if ([view isKindOfClass:[PapyrusPageView class]]) {
        pageView = (PapyrusPageView *)view;
        viewSize = pageView.bounds.size;
      }
    });
  }

  if (pageView && viewSize.width > 0 && viewSize.height > 0) {
    CGFloat rectX = x * viewSize.width;
    CGFloat rectY = y * viewSize.height;
    CGFloat rectW = width * viewSize.width;
    CGFloat rectH = height * viewSize.height;
    CGRect viewRect = CGRectMake(rectX, rectY, rectW, rectH);
    selectionRect = [pageView convertRectToPage:viewRect page:page];
  } else {
    CGFloat rectX = pageOriginX + (x * pageWidth);
    CGFloat rectW = width * pageWidth;
    CGFloat rectH = height * pageHeight;
    CGFloat rectTop = y * pageHeight;
    CGFloat rectY = pageOriginY + (pageHeight - rectTop - rectH);
    selectionRect = CGRectMake(rectX, rectY, rectW, rectH);
  }

  BOOL hasEndpoints = isfinite(startX) && isfinite(startY) && isfinite(endX) && isfinite(endY) &&
    startX >= 0 && startY >= 0 && endX >= 0 && endY >= 0;
  if (hasEndpoints) {
    // Use the complete page to discover both endpoint lines. The gesture
    // rectangle may not cover the final line when the finger moves left.
    CGRect fullPageRect = CGRectMake(pageOriginX, pageOriginY, pageWidth, pageHeight);
    PDFSelection *broadSelection = [page selectionForRect:fullPageRect];
    NSArray<PDFSelection *> *broadLines = [broadSelection selectionsByLine];
    if (!broadSelection || !broadLines || broadLines.count == 0) {
      resolve([NSNull null]);
      return;
    }

    CGPoint (^pagePointForNormalized)(CGFloat, CGFloat) = ^CGPoint(CGFloat normalizedX, CGFloat normalizedY) {
      if (pageView && viewSize.width > 0 && viewSize.height > 0) {
        CGRect viewPoint = CGRectMake(normalizedX * viewSize.width, normalizedY * viewSize.height, 1, 1);
        CGRect pagePoint = [pageView convertRectToPage:viewPoint page:page];
        return CGPointMake(CGRectGetMidX(pagePoint), CGRectGetMidY(pagePoint));
      }
      return CGPointMake(pageOriginX + normalizedX * pageWidth,
                         pageOriginY + pageHeight - normalizedY * pageHeight);
    };

    CGPoint startPoint = pagePointForNormalized(startX, startY);
    CGPoint endPoint = pagePointForNormalized(endX, endY);
    BOOL isPointSelection = fabs(startX - endX) < 1e-9 && fabs(startY - endY) < 1e-9;
    if (isPointSelection) {
      NSString *pageString = page.string ?: @"";
      NSUInteger charIndex = [page characterIndexAtPoint:startPoint];
      if (charIndex != NSNotFound && charIndex < pageString.length &&
          PapyrusIsWordCharacter([pageString characterAtIndex:charIndex])) {
        NSUInteger wordStart = charIndex;
        while (wordStart > 0 &&
               PapyrusIsWordCharacter([pageString characterAtIndex:wordStart - 1])) {
          wordStart -= 1;
        }
        NSUInteger wordEnd = charIndex + 1;
        while (wordEnd < pageString.length &&
               PapyrusIsWordCharacter([pageString characterAtIndex:wordEnd])) {
          wordEnd += 1;
        }
        PDFSelection *wordSelection =
          [page selectionForRange:NSMakeRange(wordStart, wordEnd - wordStart)];
        if (wordSelection && wordSelection.string.length > 0) {
          CGRect wordBounds = [wordSelection boundsForPage:page];
          if (!CGRectIsEmpty(wordBounds)) {
            NSDictionary *rect = nil;
            if (pageView && viewSize.width > 0 && viewSize.height > 0) {
              CGRect viewBounds = [pageView convertRectFromPage:wordBounds page:page];
              rect = @{
                @"x": @(viewBounds.origin.x / viewSize.width),
                @"y": @(viewBounds.origin.y / viewSize.height),
                @"width": @(viewBounds.size.width / viewSize.width),
                @"height": @(viewBounds.size.height / viewSize.height)
              };
            } else {
              CGFloat topLeftY =
                (pageOriginY + pageHeight) - (wordBounds.origin.y + wordBounds.size.height);
              rect = @{
                @"x": @((wordBounds.origin.x - pageOriginX) / pageWidth),
                @"y": @(topLeftY / pageHeight),
                @"width": @(wordBounds.size.width / pageWidth),
                @"height": @(wordBounds.size.height / pageHeight)
              };
            }
            resolve(@{
              @"text": wordSelection.string,
              @"rects": @[rect]
            });
            return;
          }
        }
      }
      resolve([NSNull null]);
      return;
    }
    NSUInteger startLine = 0;
    NSUInteger endLine = 0;
    CGFloat startDistance = CGFLOAT_MAX;
    CGFloat endDistance = CGFLOAT_MAX;
    for (NSUInteger index = 0; index < broadLines.count; index++) {
      CGRect lineBounds = [broadLines[index] boundsForPage:page];
      CGFloat startLineDistance = startPoint.y > CGRectGetMaxY(lineBounds)
        ? startPoint.y - CGRectGetMaxY(lineBounds)
        : (startPoint.y < CGRectGetMinY(lineBounds) ? CGRectGetMinY(lineBounds) - startPoint.y : 0);
      CGFloat endLineDistance = endPoint.y > CGRectGetMaxY(lineBounds)
        ? endPoint.y - CGRectGetMaxY(lineBounds)
        : (endPoint.y < CGRectGetMinY(lineBounds) ? CGRectGetMinY(lineBounds) - endPoint.y : 0);
      if (startLineDistance < startDistance) {
        startDistance = startLineDistance;
        startLine = index;
      }
      if (endLineDistance < endDistance) {
        endDistance = endLineDistance;
        endLine = index;
      }
    }

    BOOL forward = startLine < endLine || (startLine == endLine && startPoint.x <= endPoint.x);
    NSUInteger firstLine = MIN(startLine, endLine);
    NSUInteger lastLine = MAX(startLine, endLine);
    NSMutableString *selectedString = [NSMutableString string];
    NSMutableArray *endpointRects = [NSMutableArray arrayWithCapacity:lastLine - firstLine + 1];
    for (NSUInteger index = firstLine; index <= lastLine; index++) {
      CGRect broadLineBounds = [broadLines[index] boundsForPage:page];
      CGRect fullLineRect = CGRectMake(pageOriginX,
                                       broadLineBounds.origin.y - 1,
                                       pageWidth,
                                       broadLineBounds.size.height + 2);
      PDFSelection *fullLine = [page selectionForRect:fullLineRect];
      CGRect lineBounds = fullLine ? [fullLine boundsForPage:page] : broadLineBounds;
      CGFloat left = CGRectGetMinX(lineBounds);
      CGFloat right = CGRectGetMaxX(lineBounds);
      if (startLine == endLine) {
        left = MIN(startPoint.x, endPoint.x);
        right = MAX(startPoint.x, endPoint.x);
      } else if (forward) {
        if (index == startLine) left = startPoint.x;
        if (index == endLine) right = endPoint.x;
      } else {
        if (index == startLine) right = startPoint.x;
        if (index == endLine) left = endPoint.x;
      }
      if (right <= left) continue;

      CGRect segmentRect = CGRectMake(left,
                                     CGRectGetMinY(lineBounds),
                                     right - left,
                                     CGRectGetHeight(lineBounds));
      PDFSelection *segment = [page selectionForRect:segmentRect];
      if (!segment || segment.string.length == 0) continue;
      [selectedString appendString:segment.string];
      CGRect bounds = [segment boundsForPage:page];
      if (CGRectIsEmpty(bounds)) continue;
      NSDictionary *rect = nil;
      if (pageView && viewSize.width > 0 && viewSize.height > 0) {
        CGRect viewBounds = [pageView convertRectFromPage:bounds page:page];
        rect = @{
          @"x": @(viewBounds.origin.x / viewSize.width),
          @"y": @(viewBounds.origin.y / viewSize.height),
          @"width": @(viewBounds.size.width / viewSize.width),
          @"height": @(viewBounds.size.height / viewSize.height)
        };
      } else {
        CGFloat topLeftY = (pageOriginY + pageHeight) - (bounds.origin.y + bounds.size.height);
        rect = @{
          @"x": @((bounds.origin.x - pageOriginX) / pageWidth),
          @"y": @(topLeftY / pageHeight),
          @"width": @(bounds.size.width / pageWidth),
          @"height": @(bounds.size.height / pageHeight)
        };
      }
      [endpointRects addObject:rect];
    }

    if (endpointRects.count == 0) {
      resolve([NSNull null]);
      return;
    }
    resolve(@{
      @"text": selectedString,
      @"rects": endpointRects
    });
    return;
  }

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

    NSDictionary *rect = nil;
    if (pageView && viewSize.width > 0 && viewSize.height > 0) {
      CGRect viewBounds = [pageView convertRectFromPage:bounds page:page];
      rect = @{
        @"x": @(viewBounds.origin.x / viewSize.width),
        @"y": @(viewBounds.origin.y / viewSize.height),
        @"width": @(viewBounds.size.width / viewSize.width),
        @"height": @(viewBounds.size.height / viewSize.height)
      };
    } else {
      CGFloat topLeftY = (pageOriginY + pageHeight) - (bounds.origin.y + bounds.size.height);
      rect = @{
        @"x": @((bounds.origin.x - pageOriginX) / pageWidth),
        @"y": @(topLeftY / pageHeight),
        @"width": @(bounds.size.width / pageWidth),
        @"height": @(bounds.size.height / pageHeight)
      };
    }
    [rects addObject:rect];
  }

  NSDictionary *result = @{
    @"text": selection.string ?: @"",
    @"rects": rects
  };
  resolve(result);
}

@end
