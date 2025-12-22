#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusEngineStore : NSObject

+ (instancetype)shared;
- (NSString *)createEngine;
- (void)destroyEngine:(NSString *)engineId;
- (void)setDocument:(PDFDocument *)document forEngine:(NSString *)engineId;
- (PDFDocument *_Nullable)documentForEngine:(NSString *)engineId;

@end

NS_ASSUME_NONNULL_END
