#import "PapyrusSelectionMenu.h"
#import "PapyrusTextDocumentView.h"
#import "PapyrusTextStore.h"
#import "PapyrusTextAnnotationRange.h"

static NSUInteger const PapyrusMaximumTextSearchHighlights = 2000;

@interface PapyrusTextDocumentView () <UITextViewDelegate, UIGestureRecognizerDelegate>
@property (nonatomic, strong) UITextView *textView;
@property (nonatomic, assign) NSInteger lastReportedStart;
@property (nonatomic, assign) NSInteger lastReportedEnd;
@property (nonatomic, assign) NSInteger lastReportedOffset;
@property (nonatomic, assign) CFAbsoluteTime lastOffsetEventTime;
@property (nonatomic, assign) BOOL hasLoadedDocument;
@property (nonatomic, assign) BOOL suppressOffsetEvents;
@property (nonatomic, strong) NSMutableDictionary<NSString *, UIButton *> *noteButtons;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSValue *> *resolvedAnnotationRanges;
@property (nonatomic, copy) NSString *resolvedAnnotationText;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray<NSString *> *> *noteGroups;
@end

@implementation PapyrusTextDocumentView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.backgroundColor = UIColor.whiteColor;
    _searchResults = @[];
    _annotations = @[];
    _annotationLabels = @{};
    _noteButtons = [NSMutableDictionary dictionary];
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
    UITapGestureRecognizer *annotationTap = [[UITapGestureRecognizer alloc] initWithTarget:self action:@selector(tapTextAnnotation:)];
    annotationTap.cancelsTouchesInView = NO; annotationTap.delegate = self;
    [_textView addGestureRecognizer:annotationTap];
    _textView.editable = NO;
    _textView.selectable = YES;
    _textView.alwaysBounceVertical = YES;
    _textView.scrollsToTop = YES;
    _textView.textContainerInset = UIEdgeInsetsMake(_pageMargin, MAX(44,_pageMargin), _pageMargin, _pageMargin);
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
  [self layoutNoteButtons];
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

- (void)setTextNavigationRequest:(NSDictionary *)request {
  if (![request isKindOfClass:NSDictionary.class] || [_textNavigationRequest isEqual:request]) return;
  _textNavigationRequest = [request copy];
  [self scrollToTextOffset:MAX(0,[request[@"offset"] integerValue])];
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
  self.textView.textContainerInset = UIEdgeInsetsMake(_pageMargin, MAX(44,_pageMargin), _pageMargin, _pageMargin);
}

- (void)setDefineLabel:(NSString *)defineLabel {
  _defineLabel = [defineLabel copy] ?: @"Define";
  [self setAnnotationLabels:self.annotationLabels];
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
  self.textView.textContainerInset = UIEdgeInsetsMake(_pageMargin, MAX(44,_pageMargin), _pageMargin, _pageMargin);
  if (self.textView.text.length > 0) {
    NSMutableParagraphStyle *paragraph = [[NSMutableParagraphStyle alloc] init];
    paragraph.minimumLineHeight = MAX(self.lineHeight,self.fontSize);
    paragraph.maximumLineHeight = MAX(self.lineHeight,self.fontSize);
    paragraph.lineBreakMode = NSLineBreakByWordWrapping;
    [self.textView.textStorage addAttribute:NSParagraphStyleAttributeName
                                      value:paragraph
                                      range:NSMakeRange(0, self.textView.textStorage.length)];
  }
}

- (void)applySearchHighlights {
  if (!self.hasLoadedDocument || self.textView.text.length == 0) return;
  NSTextStorage *storage = self.textView.textStorage;
  for (NSAttributedStringKey key in @[NSBackgroundColorAttributeName, NSUnderlineStyleAttributeName, NSUnderlineColorAttributeName, NSStrikethroughStyleAttributeName, NSStrikethroughColorAttributeName, @"PapyrusAnnotationId"]) [storage removeAttribute:key range:NSMakeRange(0, storage.length)];
  [self applyAnnotationAttributes];
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
  NSUInteger prefixStart = range.location > 48 ? range.location - 48 : 0;
  if (prefixStart > 0 && CFStringIsSurrogateLowCharacter([self.textView.text characterAtIndex:prefixStart])) prefixStart--;
  NSUInteger suffixEnd = MIN(self.textView.text.length, NSMaxRange(range)+48);
  if (suffixEnd < self.textView.text.length && CFStringIsSurrogateLowCharacter([self.textView.text characterAtIndex:suffixEnd])) suffixEnd++;
  return @{ @"text": text, @"start": @(range.location), @"end": @(NSMaxRange(range)),
    @"prefix": [self.textView.text substringWithRange:NSMakeRange(prefixStart, range.location - prefixStart)],
    @"suffix": [self.textView.text substringWithRange:NSMakeRange(NSMaxRange(range), suffixEnd - NSMaxRange(range))] };
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
  if (action == @selector(highlightSelection:) || action == @selector(underlineSelection:) ||
      action == @selector(strikeoutSelection:) || action == @selector(noteSelection:)) {
    return self.onAnnotateSelection != nil && [self selectedRangePayload] != nil;
  }
  return [super canPerformAction:action withSender:sender];
}

- (UIMenu *)textView:(UITextView *)textView
editMenuForTextInRange:(NSRange)range
     suggestedActions:(NSArray<UIMenuElement *> *)suggestedActions API_AVAILABLE(ios(16.0)) {
  if (range.location != NSNotFound && range.length > 0 && NSMaxRange(range) <= textView.text.length) {
    textView.selectedRange = range;
  }
  NSMutableArray<UIMenuElement *> *actions = [PapyrusLocalizedSelectionActions(suggestedActions, self.annotationLabels[@"copy"], self.annotationLabels[@"selectAll"]) mutableCopy] ?: [NSMutableArray array];
  if ([self selectedRangePayload] &&
      (![self.defineSelectionMode isEqualToString:@"single-word"] || [self isSingleWordSelection])) {
  UIAction *define = [UIAction actionWithTitle:self.defineLabel image:[UIImage systemImageNamed:@"text.magnifyingglass"] identifier:nil handler:^(__kindof UIAction *action) {
    #pragma unused(action)
    [self defineCurrentSelection:nil];
  }];
    [actions insertObject:define atIndex:0];
  }
  if ([self selectedRangePayload] && self.onAnnotateSelection) {
    NSMutableArray *marks = [NSMutableArray array];
    for (NSString *style in @[@"highlight", @"underline", @"strikeout", @"comment"]) {
      NSString *label = self.annotationLabels[style];
      if (!label.length) continue;
      NSDictionary *symbols = @{@"highlight":@"highlighter", @"underline":@"underline",
          @"strikeout":@"strikethrough", @"comment":@"note.text"};
      [marks addObject:[UIAction actionWithTitle:label image:[UIImage systemImageNamed:symbols[style]] identifier:nil handler:^(__kindof UIAction *action) {
        [self emitAnnotationIntent:style];
      }]];
    }
    if (marks.count) [actions insertObject:[UIMenu menuWithTitle:self.annotationLabels[@"annotate"] ?: @"" children:marks] atIndex:0];
  }
  return [UIMenu menuWithChildren:actions];
}


- (void)setAnnotations:(NSArray<NSDictionary *> *)value {
  _annotations = [value copy] ?: @[];
  self.resolvedAnnotationRanges = [NSMutableDictionary dictionary];
  [self applySearchHighlights];
}
- (void)setAnnotationLabels:(NSDictionary<NSString *,NSString *> *)value {
  _annotationLabels = [value copy] ?: @{};
  if (@available(iOS 16.0, *)) return;
  NSMutableArray *items = [NSMutableArray array];
  [items addObject:[[UIMenuItem alloc] initWithTitle:self.defineLabel action:@selector(defineCurrentSelection:)]];
  NSArray *styles = @[@"highlight", @"underline", @"strikeout", @"comment"];
  NSArray *selectors = @[@"highlightSelection:", @"underlineSelection:", @"strikeoutSelection:", @"noteSelection:"];
  for (NSUInteger i=0; i<styles.count; i++) if (_annotationLabels[styles[i]].length) [items addObject:[[UIMenuItem alloc] initWithTitle:_annotationLabels[styles[i]] action:NSSelectorFromString(selectors[i])]];
  UIMenuController.sharedMenuController.menuItems = items;
}
- (void)highlightSelection:(id)sender { [self emitAnnotationIntent:@"highlight"]; }
- (void)underlineSelection:(id)sender { [self emitAnnotationIntent:@"underline"]; }
- (void)strikeoutSelection:(id)sender { [self emitAnnotationIntent:@"strikeout"]; }
- (void)noteSelection:(id)sender { [self emitAnnotationIntent:@"comment"]; }
- (void)emitAnnotationIntent:(NSString *)style {
  NSDictionary *selection = [self selectedRangePayload];
  if (!selection || !self.onAnnotateSelection) return;
  NSMutableDictionary *payload = [selection mutableCopy];
  payload[@"style"] = style;
  self.onAnnotateSelection(@{ @"nativeEvent": payload });
}
- (NSRange)rangeForAnnotation:(NSDictionary *)annotation {
  if (![annotation isKindOfClass:NSDictionary.class]) return NSMakeRange(NSNotFound,0);
  NSString *identifier = annotation[@"id"];
  if (![identifier isKindOfClass:NSString.class]) return NSMakeRange(NSNotFound,0);
  if (![self.resolvedAnnotationText isEqual:self.textView.text]) {
    self.resolvedAnnotationText = self.textView.text.copy;
    self.resolvedAnnotationRanges = [NSMutableDictionary dictionary];
  }
  NSValue *cached = self.resolvedAnnotationRanges[identifier];
  if (cached) return cached.rangeValue;
  NSRange resolved = [self resolveRangeForAnnotation:annotation];
  self.resolvedAnnotationRanges[identifier] = [NSValue valueWithRange:resolved];
  return resolved;
}
- (NSRange)resolveRangeForAnnotation:(NSDictionary *)annotation {
  if (![annotation isKindOfClass:NSDictionary.class]) return NSMakeRange(NSNotFound,0);
  NSDictionary *anchor = [annotation[@"anchor"] isKindOfClass:NSDictionary.class] ? annotation[@"anchor"] : @{};
  NSDictionary *range = [anchor[@"kind"] isEqual:@"text-range"] ? anchor : annotation[@"textRange"];
  if (![range isKindOfClass:NSDictionary.class]) return NSMakeRange(NSNotFound, 0);
  if (![range[@"start"] isKindOfClass:NSNumber.class] || ![range[@"end"] isKindOfClass:NSNumber.class]) return NSMakeRange(NSNotFound,0);
  NSInteger start = [range[@"start"] integerValue], end = [range[@"end"] integerValue];
  if ([anchor[@"kind"] isEqual:@"text-range"]) return PapyrusResolveTextAnnotationRange(self.textView.text,anchor);
  if (start < 0 || end <= start || end > self.textView.text.length) return NSMakeRange(NSNotFound, 0);
  NSRange result = NSMakeRange(start, end-start);
  NSString *quote = anchor[@"quote"];
  if ([quote isKindOfClass:NSString.class] && ![[self.textView.text substringWithRange:result] isEqual:quote]) return NSMakeRange(NSNotFound,0);
  return result;
}
- (UIColor *)annotationColor:(NSDictionary *)annotation {
  NSString *hex = annotation[@"color"];
  unsigned int rgb = 0xFFC928;
  if ([hex isKindOfClass:NSString.class]) [[NSScanner scannerWithString:[hex stringByReplacingOccurrencesOfString:@"#" withString:@""]] scanHexInt:&rgb];
  return [UIColor colorWithRed:((rgb>>16)&255)/255.0 green:((rgb>>8)&255)/255.0 blue:(rgb&255)/255.0 alpha:1];
}
- (void)applyAnnotationAttributes {
  NSMutableSet *visibleIds = [NSMutableSet set];
  for (NSDictionary *annotation in self.annotations) {
    NSRange range = [self rangeForAnnotation:annotation];
    if (range.location == NSNotFound) continue;
    NSString *style = annotation[@"markupStyle"] ?: annotation[@"type"];
    UIColor *color = [self annotationColor:annotation];
    NSTextStorage *storage = self.textView.textStorage;
    if ([style isEqual:@"highlight"]) [storage addAttribute:NSBackgroundColorAttributeName value:[color colorWithAlphaComponent:annotation[@"opacity"] ? MAX(0,MIN(1,[annotation[@"opacity"] doubleValue])) : 0.35] range:range];
    if ([style isEqual:@"underline"] || [style isEqual:@"squiggly"]) {
      [storage addAttribute:NSUnderlineStyleAttributeName value:@(NSUnderlineStyleSingle) range:range];
      [storage addAttribute:NSUnderlineColorAttributeName value:color range:range];
    }
    if ([style isEqual:@"strikeout"]) {
      [storage addAttribute:NSStrikethroughStyleAttributeName value:@(NSUnderlineStyleSingle) range:range];
      [storage addAttribute:NSStrikethroughColorAttributeName value:color range:range];
    }
    NSString *identifier = annotation[@"id"];
    if (![identifier isKindOfClass:NSString.class]) continue;
    [storage addAttribute:@"PapyrusAnnotationId" value:identifier range:range];
    BOOL note = annotation[@"noteContent"] != nil || [annotation[@"type"] isEqual:@"comment"] || [annotation[@"type"] isEqual:@"text"];
    if (note) {
      [visibleIds addObject:identifier];
      UIButton *button = self.noteButtons[identifier];
      BOOL created = button == nil;
      if (created) button = [UIButton buttonWithType:UIButtonTypeSystem];
      [button setTitle:@"●" forState:UIControlStateNormal];
      [button setTitleColor:color forState:UIControlStateNormal];
      button.accessibilityIdentifier = identifier;
      button.accessibilityLabel = self.annotationLabels[@"comment"] ?: @"";
      if (created) [button addTarget:self action:@selector(openAnnotationNote:) forControlEvents:UIControlEventTouchUpInside];
      self.noteButtons[identifier] = button;
      if (created) {
        [self.textView addSubview:button];
        if (!UIAccessibilityIsReduceMotionEnabled()) {button.alpha=0;button.transform=CGAffineTransformMakeScale(0.92,0.92);[UIView animateWithDuration:0.18 animations:^{button.alpha=1;button.transform=CGAffineTransformIdentity;}];}
      }
    }
  }
  for (NSString *identifier in self.noteButtons.allKeys.copy) if (![visibleIds containsObject:identifier]) {[self.noteButtons[identifier] removeFromSuperview];[self.noteButtons removeObjectForKey:identifier];}
  [self layoutNoteButtons];
}
- (void)layoutNoteButtons {
  if (self.noteButtons.count == 0) return;
  [self.textView.layoutManager ensureLayoutForTextContainer:self.textView.textContainer];
  self.noteGroups = [NSMutableDictionary dictionary];
  NSMutableDictionary<NSNumber *, NSMutableArray<UIButton *> *> *groups = [NSMutableDictionary dictionary];
  for (NSDictionary *annotation in self.annotations) {
    UIButton *button = self.noteButtons[annotation[@"id"]];
    NSRange range = [self rangeForAnnotation:annotation];
    if (!button || range.location == NSNotFound) continue;
    NSRange glyph = [self.textView.layoutManager glyphRangeForCharacterRange:NSMakeRange(range.location,1) actualCharacterRange:NULL];
    CGRect bounds = [self.textView.layoutManager boundingRectForGlyphRange:glyph inTextContainer:self.textView.textContainer];
    // Reserved outside the text container; follows UITextView's own content scroll.
    CGFloat y = bounds.origin.y + self.textView.textContainerInset.top - 6;
    button.frame = CGRectMake(0, floor(y/44)*44, 44, 44);
    NSNumber *key = @(floor(y/44));
    if (!groups[key]) groups[key] = [NSMutableArray array];
    [groups[key] addObject:button];
    button.hidden = YES;
  }
  for (NSArray<UIButton *> *buttons in groups.allValues) {
    UIButton *leader = buttons.firstObject;
    leader.hidden = NO;
    NSMutableArray *ids=[NSMutableArray array];for(UIButton *button in buttons)[ids addObject:button.accessibilityIdentifier];
    self.noteGroups[leader.accessibilityIdentifier]=ids;
    [leader setTitle:buttons.count > 1 ? [NSString stringWithFormat:@"%lu",(unsigned long)buttons.count] : @"●" forState:UIControlStateNormal];
    if (@available(iOS 14.0,*)) {
      NSMutableArray *actions = [NSMutableArray array];
      for (UIButton *button in buttons) {
        NSString *identifier = button.accessibilityIdentifier;
        NSString *title = identifier;
        for (NSDictionary *annotation in self.annotations) if ([annotation[@"id"] isEqual:identifier]) { title = annotation[@"noteContent"] ?: annotation[@"content"] ?: identifier; break; }
        __weak typeof(self) weakSelf = self;
        [actions addObject:[UIAction actionWithTitle:title image:nil identifier:nil handler:^(__kindof UIAction *action) {
          if (weakSelf.onAnnotationTap) weakSelf.onAnnotationTap(@{@"nativeEvent":@{@"id":identifier}});
        }]];
      }
      leader.menu = buttons.count > 1 ? [UIMenu menuWithTitle:self.annotationLabels[@"comment"] ?: @"" children:actions] : nil;
      leader.showsMenuAsPrimaryAction = buttons.count > 1;
    }
  }
}
- (BOOL)gestureRecognizer:(UIGestureRecognizer *)recognizer shouldRecognizeSimultaneouslyWithGestureRecognizer:(UIGestureRecognizer *)other { return YES; }
- (void)tapTextAnnotation:(UITapGestureRecognizer *)recognizer {
  if (recognizer.state != UIGestureRecognizerStateEnded || self.textView.selectedRange.length > 0) return;
  if (self.textView.layoutManager.numberOfGlyphs == 0) return;
  CGPoint point = [recognizer locationInView:self.textView];
  point.x -= self.textView.textContainerInset.left; point.y -= self.textView.textContainerInset.top;
  CGFloat fraction = 0;
  NSUInteger glyph = [self.textView.layoutManager glyphIndexForPoint:point inTextContainer:self.textView.textContainer fractionOfDistanceThroughGlyph:&fraction];
  if (glyph >= self.textView.layoutManager.numberOfGlyphs) return;
  CGRect bounds = [self.textView.layoutManager boundingRectForGlyphRange:NSMakeRange(glyph,1) inTextContainer:self.textView.textContainer];
  if (!CGRectContainsPoint(CGRectInset(bounds,-3,-3),point)) return;
  NSUInteger index = [self.textView.layoutManager characterIndexForGlyphAtIndex:glyph];
  for (NSDictionary *annotation in self.annotations) {
    NSRange range = [self rangeForAnnotation:annotation];
    if (range.location != NSNotFound && NSLocationInRange(index,range) && self.onAnnotationTap) {
      self.onAnnotationTap(@{@"nativeEvent":@{@"id":annotation[@"id"] ?: @""}});return;
    }
  }
}
- (void)openAnnotationNote:(UIButton *)sender {
  NSArray<NSString *> *ids=self.noteGroups[sender.accessibilityIdentifier];
  if(ids.count>1) {
    UIResponder *responder=self;while(responder && ![responder isKindOfClass:UIViewController.class])responder=responder.nextResponder;
    UIViewController *controller=(UIViewController *)responder;
    if(!controller || controller.presentedViewController)return;
    UIAlertController *menu=[UIAlertController alertControllerWithTitle:self.annotationLabels[@"comment"] message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    __weak typeof(self) weakSelf=self;
    for(NSString *identifier in ids){NSString *title=identifier;for(NSDictionary *a in self.annotations)if([a[@"id"] isEqual:identifier]){title=a[@"noteContent"] ?: a[@"content"] ?: identifier;break;}
      [menu addAction:[UIAlertAction actionWithTitle:title style:UIAlertActionStyleDefault handler:^(UIAlertAction *action){if(weakSelf.onAnnotationTap)weakSelf.onAnnotationTap(@{@"nativeEvent":@{@"id":identifier}});}]];
    }
    menu.popoverPresentationController.sourceView=sender;menu.popoverPresentationController.sourceRect=sender.bounds;
    [controller presentViewController:menu animated:!UIAccessibilityIsReduceMotionEnabled() completion:nil];return;
  }
  if (self.onAnnotationTap) self.onAnnotationTap(@{ @"nativeEvent": @{ @"id": sender.accessibilityIdentifier ?: @"" } });
}

@end
