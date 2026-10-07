#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusTextStore : NSObject
+ (instancetype)shared;
- (void)setText:(NSString *)text engineId:(NSString *)engineId generation:(NSInteger)generation;
- (nullable NSString *)textForEngineId:(NSString *)engineId generation:(NSInteger)generation;
- (void)closeEngineId:(NSString *)engineId generation:(NSInteger)generation;
- (void)closeEngineId:(NSString *)engineId;
@end

NS_ASSUME_NONNULL_END
