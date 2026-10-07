#import "PapyrusPageRotationRegistry.h"

@interface PapyrusPageRotationLease ()
@property (nonatomic, weak, readwrite) PDFDocument *document;
@property (nonatomic, assign, readwrite) NSInteger pageIndex;
@property (nonatomic, assign, readwrite) NSUInteger generation;
@property (nonatomic, copy, readwrite) NSString *token;
@end

@implementation PapyrusPageRotationLease
@end

@interface PapyrusPageRotationRecord : NSObject
@property (nonatomic, assign) NSInteger originalRotation;
@property (nonatomic, assign) NSUInteger generation;
@property (nonatomic, strong) NSMutableSet<NSString *> *leaseTokens;
@end

@implementation PapyrusPageRotationRecord
@end

@interface PapyrusPageRotationRegistry ()
@property (nonatomic, strong) NSMapTable<PDFDocument *, NSMutableDictionary<NSNumber *, PapyrusPageRotationRecord *> *> *recordsByDocument;
@property (nonatomic, strong) NSMapTable<PDFDocument *, NSNumber *> *generationsByDocument;
@end

@implementation PapyrusPageRotationRegistry

+ (instancetype)sharedRegistry {
  static PapyrusPageRotationRegistry *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    registry = [PapyrusPageRotationRegistry new];
  });
  return registry;
}

- (instancetype)init {
  self = [super init];
  if (!self) return nil;
  _recordsByDocument = [NSMapTable weakToStrongObjectsMapTable];
  _generationsByDocument = [NSMapTable weakToStrongObjectsMapTable];
  return self;
}

- (NSInteger)normalizeRotation:(NSInteger)rotation {
  NSInteger normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

- (NSUInteger)generationForDocument:(PDFDocument *)document {
  NSNumber *generation = [self.generationsByDocument objectForKey:document];
  return generation ? generation.unsignedIntegerValue : 1;
}

- (NSUInteger)advanceGenerationForDocument:(PDFDocument *)document {
  NSUInteger nextGeneration = [self generationForDocument:document] + 1;
  if (nextGeneration == 0) nextGeneration = 1;
  [self.generationsByDocument setObject:@(nextGeneration) forKey:document];
  return nextGeneration;
}

- (NSMutableDictionary<NSNumber *, PapyrusPageRotationRecord *> *)recordsForDocument:(PDFDocument *)document
                                                                               create:(BOOL)create {
  NSMutableDictionary<NSNumber *, PapyrusPageRotationRecord *> *records =
      [self.recordsByDocument objectForKey:document];
  if (!records && create) {
    records = [NSMutableDictionary dictionary];
    [self.recordsByDocument setObject:records forKey:document];
  }
  return records;
}

- (PapyrusPageRotationLease *)newLeaseForDocument:(PDFDocument *)document
                                             page:(PDFPage *)page
                                        pageIndex:(NSInteger)pageIndex {
  NSUInteger generation = [self generationForDocument:document];
  NSMutableDictionary *records = [self recordsForDocument:document create:YES];
  NSNumber *pageKey = @(pageIndex);
  PapyrusPageRotationRecord *record = records[pageKey];
  if (!record || record.generation != generation) {
    record = [PapyrusPageRotationRecord new];
    record.originalRotation = page.rotation;
    record.generation = generation;
    record.leaseTokens = [NSMutableSet set];
    records[pageKey] = record;
  }

  PapyrusPageRotationLease *lease = [PapyrusPageRotationLease new];
  lease.document = document;
  lease.pageIndex = pageIndex;
  lease.generation = generation;
  lease.token = NSUUID.UUID.UUIDString;
  [record.leaseTokens addObject:lease.token];
  return lease;
}

- (BOOL)lease:(PapyrusPageRotationLease *)lease
  isValidForDocument:(PDFDocument *)document
           pageIndex:(NSInteger)pageIndex {
  if (!lease || lease.document != document || lease.pageIndex != pageIndex) return NO;
  NSUInteger currentGeneration = [self generationForDocument:document];
  if (lease.generation != currentGeneration) return NO;
  PapyrusPageRotationRecord *record =
      [[self recordsForDocument:document create:NO] objectForKey:@(pageIndex)];
  if (!record || record.generation != currentGeneration) return NO;
  return [record.leaseTokens containsObject:lease.token];
}

- (void)releaseLeaseLocked:(PapyrusPageRotationLease *)lease {
  PDFDocument *document = lease.document;
  if (!document) return;
  NSUInteger currentGeneration = [self generationForDocument:document];
  if (lease.generation != currentGeneration) return;

  NSMutableDictionary *records = [self recordsForDocument:document create:NO];
  NSNumber *pageKey = @(lease.pageIndex);
  PapyrusPageRotationRecord *record = records[pageKey];
  if (!record || record.generation != currentGeneration ||
      ![record.leaseTokens containsObject:lease.token]) {
    return;
  }

  [record.leaseTokens removeObject:lease.token];
  if (record.leaseTokens.count > 0) return;

  PDFPage *page = [document pageAtIndex:lease.pageIndex];
  if (page) page.rotation = (int)record.originalRotation;
  [records removeObjectForKey:pageKey];
  if (records.count == 0) [self.recordsByDocument removeObjectForKey:document];
}

- (PapyrusPageRotationLease *)applyViewerRotation:(NSInteger)viewerRotation
                                           toPage:(PDFPage *)page
                                         document:(PDFDocument *)document
                                        pageIndex:(NSInteger)pageIndex
                                   replacingLease:(PapyrusPageRotationLease *)lease {
  NSAssert(NSThread.isMainThread, @"PDF page rotations must be changed on the main thread");
  @synchronized (self) {
    if (![self lease:lease isValidForDocument:document pageIndex:pageIndex]) {
      [self releaseLeaseLocked:lease];
      lease = [self newLeaseForDocument:document page:page pageIndex:pageIndex];
    }

    PapyrusPageRotationRecord *record =
        [[self recordsForDocument:document create:NO] objectForKey:@(pageIndex)];
    NSInteger effectiveRotation =
        [self normalizeRotation:record.originalRotation + viewerRotation];
    page.rotation = (int)effectiveRotation;
    return lease;
  }
}

- (void)releaseLease:(PapyrusPageRotationLease *)lease {
  if (!lease) return;
  NSAssert(NSThread.isMainThread, @"PDF page rotations must be changed on the main thread");
  @synchronized (self) {
    [self releaseLeaseLocked:lease];
  }
}

- (void)restoreAllRotationsForDocument:(PDFDocument *)document {
  if (!document) return;
  NSAssert(NSThread.isMainThread, @"PDF page rotations must be changed on the main thread");
  @synchronized (self) {
    NSDictionary<NSNumber *, PapyrusPageRotationRecord *> *records =
        [[self recordsForDocument:document create:NO] copy];
    [records enumerateKeysAndObjectsUsingBlock:^(NSNumber *pageIndex,
                                                  PapyrusPageRotationRecord *record,
                                                  __unused BOOL *stop) {
      PDFPage *page = [document pageAtIndex:pageIndex.integerValue];
      if (page) page.rotation = (int)record.originalRotation;
    }];
    [self.recordsByDocument removeObjectForKey:document];
    [self advanceGenerationForDocument:document];
  }
}

@end
