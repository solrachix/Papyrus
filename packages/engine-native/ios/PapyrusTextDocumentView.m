#import "PapyrusTextDocumentView.h"
#import "PapyrusTextStore.h"

static NSUInteger const PapyrusMaximumTextSearchHighlights = 2000;

@interface PapyrusTextDocumentView () <UITextViewDelegate>
@property (nonatomic, strong) UITextView *textView;
@property (nonatomic, assign) NSInteger lastReportedStart;
@property (nonatomic, assign) NSInteger lastReportedEnd;
@property (nonatomic, assign) NSInteger lastReportedOffset;
@property (nonatomic, assign) CFAbsoluteTime lastOffsetEventTime;
@property (nonatomic, assign) BOOL hasLoadedDocument;
@property (nonatomic, assign) BOOL suppressOffsetEvents;
@end

@implementation PapyrusTextDocumentView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.backgroundColor = UIColor.whiteColor;
    _searchResults = @[];
    _activeSearchIndex = -1;
    _pageTheme = @"normal";
    _uiTheme = @"light";
    _fontSize = 18;
    _lineHeight = 28;
    _pageMargin = 20;
    _defineLabel = @"Define";
    _defineSelectionMode = @"selection";
    _lastReportedOffset = -1;
    _textView = [[UITextView alloc] initWithFrame:self.bounds];
    _textView.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    _textView.delegate = self;
    _textView.editable = NO;
    _textView.selectable = YES;
    _textView.alwaysBounceVertical = YES;
    _textView.scrollsToTop = YES;
    _textView.textContainerInset = UIEdgeInsetsMake(_pageMargin, _pageMargin, _pageMargin, _pageMargin);
    _textView.backgroundColor = UIColor.whiteColor;
    _textView.textColor = UIColor.blackColor;
    [self addSubview:_textView];

    if (@available(iOS 16.0, *)) {
      // UITextViewDelegate supplies the custom action to the native selection menu.
    } else {
      UIMenuController.sharedMenuController.menuItems = @[
        [[UIMenuItem alloc] initWithTitle:_defineLabel action:@selector(defineCurrentSelection:)]
      ];
    }
  }
  return self;
}

- (void)didMoveToWindow {
  [super didMoveToWindow];
  [self reloadTextIfAvailable];
}

- (void)layoutSubviews {
  [super layoutSubviews];
  [self reloadTextIfAvailable];
}

- (void)setEngineId:(NSString *)engineId {
  if ([_engineId isEqualToString:engineId]) return;
  _engineId = [engineId copy];
  self.hasLoadedDocument = NO;
  [self reloadTextIfAvailable];
}

- (void)setDocumentGeneration:(NSInteger)documentGeneration {
  if (_documentGeneration == documentGeneration) return;
  _documentGeneration = documentGeneration;
  self.hasLoadedDocument = NO;
  [self reloadTextIfAvailable];
}

- (void)setCurrentTextOffset:(NSInteger)currentTextOffset {
  NSInteger nextOffset = MAX(0, currentTextOffset);
  BOOL changed = _currentTextOffset != nextOffset;
  _currentTextOffset = nextOffset;
  if (changed) [self scrollToTextOffset:_currentTextOffset];
}

- (void)setScrollToTextOffsetSignal:(NSNumber *)scrollToTextOffsetSignal {
  if ((_scrollToTextOffsetSignal == scrollToTextOffsetSignal) ||
      [_scrollToTextOffsetSignal isEqualToNumber:scrollToTextOffsetSignal]) return;
  _scrollToTextOffsetSignal = [scrollToTextOffsetSignal copy];
  [self scrollToTextOffset:scrollToTextOffsetSignal.integerValue];
}

- (void)setSearchResults:(NSArray<NSDictionary *> *)searchResults {
  _searchResults = [searchResults copy] ?: @[];
  [self applySearchHighlights];
}

- (void)setActiveSearchIndex:(NSInteger)activeSearchIndex {
  _activeSearchIndex = activeSearchIndex;
  [self applySearchHighlights];
}

- (void)setPageTheme:(NSString *)pageTheme {
  _pageTheme = [pageTheme copy] ?: @"normal";
  [self applyThemeAndTypography];
  [self applySearchHighlights];
}

- (void)setUiTheme:(NSString *)uiTheme {
  _uiTheme = [uiTheme copy] ?: @"light";
  [self applyThemeAndTypography];
  [self applySearchHighlights];
}

- (void)setFontSize:(CGFloat)fontSize {
  _fontSize = MAX(10, MIN(48, fontSize));
  [self applyThemeAndTypography];
}

- (void)setLineHeight:(CGFloat)lineHeight {
  _lineHeight = MAX(_fontSize, MIN(72, lineHeight));
  [self applyThemeAndTypography];
}

- (void)setPageMargin:(CGFloat)pageMargin {
  _pageMargin = MAX(8, MIN(64, pageMargin));
  self.textView.textContainerInset = UIEdgeInsetsMake(_pageMargin, _pageMargin, _pageMargin, _pageMargin);
}

- (void)setDefineLabel:(NSString *)defineLabel {
  _defineLabel = [defineLabel copy] ?: @"Define";
  if (@available(iOS 16.0, *)) return;
  UIMenuController.sharedMenuController.menuItems = @[
    [[UIMenuItem alloc] initWithTitle:_defineLabel action:@selector(defineCurrentSelection:)]
  ];
}

- (void)setDefineSelectionMode:(NSString *)defineSelectionMode {
  _defineSelectionMode = [defineSelectionMode copy] ?: @"selection";
}

- (void)reloadTextIfAvailable {
  if (self.hasLoadedDocument || self.engineId.length == 0 || self.documentGeneration <= 0) return;
  NSString *text = [[PapyrusTextStore shared] textForEngineId:self.engineId generation:self.documentGeneration];
  if (!text) return;
  self.hasLoadedDocument = YES;
  self.suppressOffsetEvents = YES;
  [self applyThemeAndTypography];
  self.textView.text = text;
  [self applyThemeAndTypography];
  self.suppressOffsetEvents = NO;
  [self applySearchHighlights];
  [self scrollToTextOffset:self.currentTextOffset];
}

- (void)applyThemeAndTypography {
  UIColor *paper = UIColor.whiteColor;
  UIColor *foreground = UIColor.blackColor;
  if ([self.pageTheme isEqualToString:@"sepia"]) {
    paper = [UIColor colorWithRed:0.957 green:0.922 blue:0.843 alpha:1];
    foreground = [UIColor colorWithRed:0.20 green:0.17 blue:0.12 alpha:1];
  } else if ([self.pageTheme isEqualToString:@"dark"]) {
    paper = [UIColor colorWithRed:0.12 green:0.12 blue:0.13 alpha:1];
    foreground = [UIColor colorWithRed:0.92 green:0.92 blue:0.92 alpha:1];
  } else if ([self.pageTheme isEqualToString:@"high-contrast"]) {
    paper = UIColor.blackColor;
    foreground = UIColor.whiteColor;
  } else if ([self.uiTheme isEqualToString:@"dark"]) {
    paper = [UIColor colorWithRed:0.12 green:0.12 blue:0.13 alpha:1];
    foreground = [UIColor colorWithRed:0.92 green:0.92 blue:0.92 alpha:1];
  }
  self.backgroundColor = paper;
  self.textView.backgroundColor = paper;
  self.textView.textColor = foreground;
  self.textView.font = [UIFont systemFontOfSize:self.fontSize];
  self.textView.textContainerInset = UIEdgeInsetsMake(_pageMargin, _pageMargin, _pageMargin, _pageMargin);
  if (self.textView.text.length > 0) {
    NSMutableParagraphStyle *paragraph = [[NSMutableParagraphStyle alloc] init];
    paragraph.minimumLineHeight = self.lineHeight;
    paragraph.maximumLineHeight = self.lineHeight;
    paragraph.lineBreakMode = NSLineBreakByWordWrapping;
    [self.textView.textStorage addAttribute:NSParagraphStyleAttributeName
                                      value:paragraph
                                      range:NSMakeRange(0, self.textView.textStorage.length)];
  }
}

- (void)applySearchHighlights {
  if (!self.hasLoadedDocument || self.textView.text.length == 0) return;
  NSTextStorage *storage = self.textView.textStorage;
  [storage removeAttribute:NSBackgroundColorAttributeName range:NSMakeRange(0, storage.length)];
  NSUInteger count = MIN(self.searchResults.count, PapyrusMaximumTextSearchHighlights);
  CGFloat normalAlpha = [self.pageTheme isEqualToString:@"dark"] ? 0.35 : 0.42;
  UIColor *normal = [UIColor colorWithRed:1.0 green:0.79 blue:0.16 alpha:normalAlpha];
  UIColor *active = [UIColor colorWithRed:0.10 green:0.48 blue:0.98 alpha:0.55];
  for (NSUInteger index = 0; index < count; index++) {
    NSDictionary *location = self.searchResults[index][@"location"];
    if (![location isKindOfClass:[NSDictionary class]]) continue;
    NSInteger start = [location[@"start"] integerValue];
    NSInteger end = [location[@"end"] integerValue];
    if (start < 0 || end <= start || end > storage.length) continue;
    [storage addAttribute:NSBackgroundColorAttributeName
                    value:(NSInteger)index == self.activeSearchIndex ? active : normal
                    range:NSMakeRange((NSUInteger)start, (NSUInteger)(end - start))];
  }
}

- (void)scrollToTextOffset:(NSInteger)offset {
  if (!self.hasLoadedDocument || self.textView.text.length == 0) return;
  NSInteger safeOffset = MAX(0, MIN((NSInteger)self.textView.text.length, offset));
  UITextPosition *position = [self.textView positionFromPosition:self.textView.beginningOfDocument offset:safeOffset];
  if (!position) return;
  CGRect caret = [self.textView caretRectForPosition:position];
  if (!CGRectIsNull(caret)) {
    self.suppressOffsetEvents = YES;
    [self.textView scrollRectToVisible:CGRectInset(caret, 0, -self.fontSize * 2) animated:NO];
    self.suppressOffsetEvents = NO;
  }
}

- (NSDictionary *)selectedRangePayload {
  NSRange range = self.textView.selectedRange;
  if (range.location == NSNotFound || range.length == 0 || NSMaxRange(range) > self.textView.text.length) return nil;
  NSString *text = [self.textView.text substringWithRange:range];
  return @{ @"text": text, @"start": @(range.location), @"end": @(NSMaxRange(range)) };
}

- (void)textViewDidChangeSelection:(UITextView *)textView {
  NSDictionary *payload = [self selectedRangePayload];
  if (!payload) {
    self.lastReportedStart = -1;
    self.lastReportedEnd = -1;
    return;
  }
  NSInteger start = [payload[@"start"] integerValue];
  NSInteger end = [payload[@"end"] integerValue];
  if (start == self.lastReportedStart && end == self.lastReportedEnd) return;
  self.lastReportedStart = start;
  self.lastReportedEnd = end;
  if (self.onTextRangeSelected) self.onTextRangeSelected(@{ @"nativeEvent": payload });
}

- (BOOL)isSingleWordSelection {
  NSDictionary *payload = [self selectedRangePayload];
  NSString *text = payload[@"text"];
  if (text.length == 0 || text.length > 64) return NO;
  NSCharacterSet *spaces = NSCharacterSet.whitespaceAndNewlineCharacterSet;
  return [text rangeOfCharacterFromSet:spaces].location == NSNotFound;
}

- (void)scrollViewDidScroll:(UIScrollView *)scrollView {
  if (self.suppressOffsetEvents || !self.onTextOffsetChange || !self.hasLoadedDocument) return;
  CGPoint point = CGPointMake(2, MAX(0, scrollView.contentOffset.y) + self.textView.textContainerInset.top + 2);
  UITextPosition *position = [self.textView closestPositionToPoint:point];
  if (!position) return;
  NSInteger offset = [self.textView offsetFromPosition:self.textView.beginningOfDocument toPosition:position];
  offset = MAX(0, MIN((NSInteger)self.textView.text.length, offset));
  CFAbsoluteTime now = CFAbsoluteTimeGetCurrent();
  if (offset == self.lastReportedOffset || now - self.lastOffsetEventTime < 0.06) return;
  self.lastReportedOffset = offset;
  self.lastOffsetEventTime = now;
  _currentTextOffset = offset;
  self.onTextOffsetChange(@{ @"nativeEvent": @{ @"offset": @(offset) } });
}

- (void)defineCurrentSelection:(id)sender {
  #pragma unused(sender)
  if ([self.defineSelectionMode isEqualToString:@"single-word"] && ![self isSingleWordSelection]) return;
  NSDictionary *payload = [self selectedRangePayload];
  if (payload && self.onDefineSelection) self.onDefineSelection(@{ @"nativeEvent": payload });
}

- (BOOL)canPerformAction:(SEL)action withSender:(id)sender {
  if (action == @selector(defineCurrentSelection:)) {
    return [self selectedRangePayload] != nil &&
      (![self.defineSelectionMode isEqualToString:@"single-word"] || [self isSingleWordSelection]);
  }
  return [super canPerformAction:action withSender:sender];
}

- (UIMenu *)textView:(UITextView *)textView
editMenuForTextInRange:(NSRange)range
     suggestedActions:(NSArray<UIMenuElement *> *)suggestedActions API_AVAILABLE(ios(16.0)) {
  if (range.location != NSNotFound && range.length > 0 && NSMaxRange(range) <= textView.text.length) {
    textView.selectedRange = range;
  }
  NSMutableArray<UIMenuElement *> *actions = [suggestedActions mutableCopy] ?: [NSMutableArray array];
  if ([self selectedRangePayload] &&
      (![self.defineSelectionMode isEqualToString:@"single-word"] || [self isSingleWordSelection])) {
  UIAction *define = [UIAction actionWithTitle:self.defineLabel image:nil identifier:nil handler:^(__kindof UIAction *action) {
    #pragma unused(action)
    [self defineCurrentSelection:nil];
  }];
    [actions insertObject:define atIndex:0];
  }
  return [UIMenu menuWithChildren:actions];
}

@end
