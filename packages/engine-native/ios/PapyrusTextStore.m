#import "PapyrusTextStore.h"

@interface PapyrusTextStore ()
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSDictionary *> *documents;
@property (nonatomic, strong) NSMutableSet<NSString *> *destroyedEngineIds;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSNumber *> *closedGenerations;
@property (nonatomic, strong) NSLock *lock;
@end

@implementation PapyrusTextStore

+ (instancetype)shared {
  static PapyrusTextStore *store;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    store = [[PapyrusTextStore alloc] init];
  });
  return store;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _documents = [NSMutableDictionary dictionary];
    _destroyedEngineIds = [NSMutableSet set];
    _closedGenerations = [NSMutableDictionary dictionary];
    _lock = [[NSLock alloc] init];
  }
  return self;
}

- (void)setText:(NSString *)text engineId:(NSString *)engineId generation:(NSInteger)generation {
  if (engineId.length == 0 || !text) return;
  [self.lock lock];
  NSDictionary *previous = self.documents[engineId];
  NSNumber *closed = self.closedGenerations[engineId];
  NSInteger closedGeneration = closed ? closed.integerValue : -1;
  if (![self.destroyedEngineIds containsObject:engineId] && generation > closedGeneration && [previous[@"generation"] integerValue] <= generation) {
    self.documents[engineId] = @{ @"generation": @(generation), @"text": [text copy] };
  }
  [self.lock unlock];
}

- (NSString *)textForEngineId:(NSString *)engineId generation:(NSInteger)generation {
  [self.lock lock];
  NSDictionary *entry = self.documents[engineId];
  NSString *text = [entry[@"generation"] integerValue] == generation ? entry[@"text"] : nil;
  [self.lock unlock];
  return text;
}

- (void)closeEngineId:(NSString *)engineId generation:(NSInteger)generation {
  [self.lock lock];
  NSNumber *closed = self.closedGenerations[engineId];
  NSInteger closedGeneration = closed ? closed.integerValue : -1;
  if (generation > closedGeneration) self.closedGenerations[engineId] = @(generation);
  NSDictionary *entry = self.documents[engineId];
  if ([entry[@"generation"] integerValue] <= generation) {
    [self.documents removeObjectForKey:engineId];
  }
  [self.lock unlock];
}

- (void)closeEngineId:(NSString *)engineId {
  if (engineId.length == 0) return;
  [self.lock lock];
  [self.documents removeObjectForKey:engineId];
  [self.destroyedEngineIds addObject:engineId];
  [self.closedGenerations removeObjectForKey:engineId];
  [self.lock unlock];
}

@end
