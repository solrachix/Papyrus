#import <UIKit/UIKit.h>

// Keep system submenus and command targets, localizing only standard edit actions.
static inline NSArray<UIMenuElement *> *PapyrusLocalizedSelectionActions(
    NSArray<UIMenuElement *> *elements, NSString *copyLabel, NSString *selectAllLabel) API_AVAILABLE(ios(13.0)) {
  NSMutableArray<UIMenuElement *> *result = [NSMutableArray array];
  for (UIMenuElement *element in elements) {
    if ([element isKindOfClass:UIMenu.class]) {
      UIMenu *menu = (UIMenu *)element;
      [result addObject:[menu menuByReplacingChildren:
          PapyrusLocalizedSelectionActions(menu.children, copyLabel, selectAllLabel)]];
    } else if ([element isKindOfClass:UICommand.class]) {
      UICommand *command = (UICommand *)element;
      NSString *title = command.action == @selector(copy:) ? copyLabel :
          command.action == @selector(selectAll:) ? selectAllLabel : nil;
      if (title.length) {
        UICommand *translated = [UICommand commandWithTitle:title
            image:command.image ?: [UIImage systemImageNamed:@"doc.on.doc"]
            action:command.action propertyList:command.propertyList];
        translated.attributes = command.attributes;
        translated.state = command.state;
        [result addObject:translated];
      } else [result addObject:element];
    } else [result addObject:element];
  }
  return result;
}
