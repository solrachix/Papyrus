#import "PapyrusEngineStore.h"
#import "PapyrusPdfPageTheme.h"

NSNotificationName const PapyrusEngineStoreDocumentDidChangeNotification =
    @"PapyrusEngineStoreDocumentDidChangeNotification";
NSString *const PapyrusEngineStoreEngineIdKey = @"engineId";

@interface PapyrusEngineStore ()
@property (nonatomic, strong) NSMutableDictionary<NSString *, PDFDocument *> *documents;
- (void)postDocumentChangeForEngineId:(NSString *)engineId;
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
  if (engineId.length == 0) return;
  @synchronized(self) {
    [self.documents removeObjectForKey:engineId];
  }
  [self postDocumentChangeForEngineId:engineId];
}

- (void)setDocument:(PDFDocument *)document forEngine:(NSString *)engineId {
  if (engineId.length == 0) return;
  if (document) {
    PapyrusInstallPdfPageThemeDelegate(document);
  }
  @synchronized(self) {
    if (document) {
      self.documents[engineId] = document;
    } else {
      [self.documents removeObjectForKey:engineId];
    }
  }
  [self postDocumentChangeForEngineId:engineId];
}

- (PDFDocument *_Nullable)documentForEngine:(NSString *)engineId {
  if (engineId.length == 0) return nil;
  @synchronized(self) {
    return self.documents[engineId];
  }
}

- (void)postDocumentChangeForEngineId:(NSString *)engineId {
  [[NSNotificationCenter defaultCenter]
      postNotificationName:PapyrusEngineStoreDocumentDidChangeNotification
                    object:self
                  userInfo:@{PapyrusEngineStoreEngineIdKey : engineId}];
}

@end
