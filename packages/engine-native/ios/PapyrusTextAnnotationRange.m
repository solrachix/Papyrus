#import "PapyrusTextAnnotationRange.h"
static BOOL PapyrusTextBoundary(NSString *text, NSUInteger offset) {
  return offset <= text.length && !(offset > 0 && offset < text.length && CFStringIsSurrogateHighCharacter([text characterAtIndex:offset-1]) && CFStringIsSurrogateLowCharacter([text characterAtIndex:offset]));
}
NSRange PapyrusResolveTextAnnotationRange(NSString *text, NSDictionary *anchor) {
  if (![anchor isKindOfClass:NSDictionary.class]) return NSMakeRange(NSNotFound,0);
  NSString *quote = [anchor[@"quote"] isKindOfClass:NSString.class] ? anchor[@"quote"] : nil;
  if (![text isKindOfClass:NSString.class] || ![anchor[@"start"] isKindOfClass:NSNumber.class] || ![anchor[@"end"] isKindOfClass:NSNumber.class]) return NSMakeRange(NSNotFound,0);
  NSInteger start = [anchor[@"start"] integerValue], end = [anchor[@"end"] integerValue];
  if (!quote.length) return NSMakeRange(NSNotFound,0);
  if (start >= 0 && end > start && end <= text.length && PapyrusTextBoundary(text,start) && PapyrusTextBoundary(text,end)) {
    NSRange exact = NSMakeRange(start,end-start);
    if ([[text substringWithRange:exact] isEqual:quote]) return exact;
  }
  NSString *prefix = [anchor[@"prefix"] isKindOfClass:NSString.class] ? anchor[@"prefix"] : @"";
  NSString *suffix = [anchor[@"suffix"] isKindOfClass:NSString.class] ? anchor[@"suffix"] : @"";
  NSRange match = NSMakeRange(NSNotFound,0);
  NSUInteger offset = 0;
  while (offset < text.length) {
    NSRange candidate = [text rangeOfString:quote options:NSLiteralSearch range:NSMakeRange(offset,text.length-offset)];
    if (candidate.location == NSNotFound) break;
    NSUInteger endOffset = NSMaxRange(candidate);
    BOOL validPrefix = prefix.length == 0 || (candidate.location >= prefix.length && [[text substringWithRange:NSMakeRange(candidate.location-prefix.length,prefix.length)] isEqual:prefix]);
    BOOL validSuffix = suffix.length == 0 || (endOffset+suffix.length <= text.length && [[text substringWithRange:NSMakeRange(endOffset,suffix.length)] isEqual:suffix]);
    if (validPrefix && validSuffix && PapyrusTextBoundary(text,candidate.location) && PapyrusTextBoundary(text,endOffset)) { if (match.location != NSNotFound) return NSMakeRange(NSNotFound,0); match = candidate; }
    offset = candidate.location+1;
  }
  return match;
}
