#import "PapyrusEngineStore.h"

@interface PapyrusEngineStore ()
@property (nonatomic, strong) NSMutableDictionary<NSString *, PDFDocument *> *documents;
@end

@implementation PapyrusEngineStore

+ (instancetype)shared {
  static PapyrusEngineStore *store = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    store = [[PapyrusEngineStore alloc] init];
  });
  return store;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _documents = [NSMutableDictionary dictionary];
  }
  return self;
}

- (NSString *)createEngine {
  NSString *engineId = [[NSUUID UUID] UUIDString];
  return engineId;
}

- (void)destroyEngine:(NSString *)engineId {
  [self.documents removeObjectForKey:engineId];
}

- (void)setDocument:(PDFDocument *)document forEngine:(NSString *)engineId {
  if (!engineId) return;
  if (document) {
    self.documents[engineId] = document;
  } else {
    [self.documents removeObjectForKey:engineId];
  }
}

- (PDFDocument *_Nullable)documentForEngine:(NSString *)engineId {
  return self.documents[engineId];
}

@end
