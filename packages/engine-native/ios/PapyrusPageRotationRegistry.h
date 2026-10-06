#import <PDFKit/PDFKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface PapyrusPageRotationLease : NSObject

@property (nonatomic, weak, readonly) PDFDocument *document;
@property (nonatomic, assign, readonly) NSInteger pageIndex;
@property (nonatomic, assign, readonly) NSUInteger generation;
@property (nonatomic, copy, readonly) NSString *token;

@end

@interface PapyrusPageRotationRegistry : NSObject

+ (instancetype)sharedRegistry;

- (PapyrusPageRotationLease *)applyViewerRotation:(NSInteger)viewerRotation
                                           toPage:(PDFPage *)page
                                         document:(PDFDocument *)document
                                        pageIndex:(NSInteger)pageIndex
                                   replacingLease:(nullable PapyrusPageRotationLease *)lease;

- (void)releaseLease:(nullable PapyrusPageRotationLease *)lease;
- (void)restoreAllRotationsForDocument:(PDFDocument *)document;

@end

NS_ASSUME_NONNULL_END
