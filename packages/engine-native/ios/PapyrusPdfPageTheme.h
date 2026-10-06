#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>

NS_ASSUME_NONNULL_BEGIN

FOUNDATION_EXPORT void PapyrusInstallPdfPageThemeDelegate(PDFDocument *document);
FOUNDATION_EXPORT NSString *PapyrusAcquirePdfPageThemeLease(PDFDocument *document,
                                                            NSString *theme);
FOUNDATION_EXPORT void PapyrusUpdatePdfPageThemeLease(PDFDocument *document,
                                                       NSString *leaseToken,
                                                       NSString *theme);
FOUNDATION_EXPORT void PapyrusReleasePdfPageThemeLease(PDFDocument *document,
                                                        NSString *leaseToken);

NS_ASSUME_NONNULL_END
