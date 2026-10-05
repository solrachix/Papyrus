import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "packages/engine-native/ios/PapyrusPdfDocumentView.m"),
  "utf8"
);
const header = readFileSync(
  resolve(process.cwd(), "packages/engine-native/ios/PapyrusPdfDocumentView.h"),
  "utf8"
);
const manager = readFileSync(
  resolve(
    process.cwd(),
    "packages/engine-native/ios/PapyrusPdfDocumentViewManager.m"
  ),
  "utf8"
);
const engineIndex = readFileSync(
  resolve(process.cwd(), "packages/engine-native/index.ts"),
  "utf8"
);
const iosViewer = readFileSync(
  resolve(process.cwd(), "packages/ui-react-native/components/DedicatedIosPdfViewer.tsx"),
  "utf8"
);

const methodBody = (selector: string): string => {
  const signatureIndex = source.indexOf(`\n- (void)${selector}`);
  if (signatureIndex < 0) throw new Error(`Missing Objective-C method ${selector}`);

  const bodyStart = source.indexOf("{", signatureIndex);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  throw new Error(`Unterminated Objective-C method ${selector}`);
};

const bodyAfterSignature = (signature: string): string => {
  let searchFrom = 0;
  while (true) {
    const signatureIndex = source.indexOf(signature, searchFrom);
    if (signatureIndex < 0) throw new Error(`Missing Objective-C signature ${signature}`);

    const bodyStart = source.indexOf("{", signatureIndex);
    const declarationEnd = source.indexOf(";", signatureIndex);
    if (bodyStart >= 0 && (declarationEnd < 0 || bodyStart < declarationEnd)) {
      let depth = 0;
      for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        if (source[index] === "}") {
          depth -= 1;
          if (depth === 0) return source.slice(bodyStart, index + 1);
        }
      }
      throw new Error(`Unterminated Objective-C method ${signature}`);
    }

    searchFrom = signatureIndex + signature.length;
  }
};

describe("PapyrusPdfDocumentView programmatic zoom synchronization", () => {
  it("ignores intermediate PDFKit scale notifications during configuration", () => {
    const handler = methodBody("handlePdfScaleChanged:");

    expect(handler).toContain(
      "if (self.suppressScaleSynchronization) return;"
    );
    expect(handler.indexOf("if (self.suppressScaleSynchronization) return;")).toBeLessThan(
      handler.indexOf("CGFloat normalized")
    );
  });

  it.each([
    ["setViewMode:", "view mode change"],
    ["reloadDocumentFromStore", "document reload"],
    ["updateFitScalePreservingViewport", "viewport relayout"],
  ])("preserves the requested zoom during %s (%s)", (selector) => {
    const body = methodBody(selector);
    const desiredZoomIndex = body.indexOf(
      "CGFloat desiredZoom = [self clampedZoom:self.zoom];"
    );
    const suppressIndex = body.indexOf("self.suppressScaleSynchronization = YES;");
    const restoreZoomIndex = body.indexOf("_zoom = desiredZoom;");
    const applyZoomIndex = body.indexOf("[self applyNormalizedZoom];");
    const releaseIndex = body.lastIndexOf(
      "self.suppressScaleSynchronization = wasSuppressingScaleSynchronization;"
    );

    expect(desiredZoomIndex, `${selector}: desired zoom is captured`).toBeGreaterThan(-1);
    expect(suppressIndex, `${selector}: notifications are suppressed`).toBeGreaterThan(-1);
    expect(restoreZoomIndex, `${selector}: desired zoom is restored`).toBeGreaterThan(-1);
    expect(applyZoomIndex, `${selector}: normalized zoom is reapplied`).toBeGreaterThan(-1);
    expect(releaseIndex, `${selector}: notification sync is restored`).toBeGreaterThan(-1);
    expect(desiredZoomIndex).toBeLessThan(suppressIndex);
    expect(suppressIndex).toBeLessThan(restoreZoomIndex);
    expect(restoreZoomIndex).toBeLessThan(applyZoomIndex);
    expect(applyZoomIndex).toBeLessThan(releaseIndex);
  });
});

describe("PapyrusPdfDocumentView native text selection and search highlights", () => {
  it("observes PDFKit selection changes and exports the native event", () => {
    expect(source).toContain("PDFViewSelectionChangedNotification");
    expect(source).toContain("handlePdfSelectionChanged:");
    expect(header).toContain("RCTBubblingEventBlock onTextSelected");
    expect(manager).toContain(
      "RCT_EXPORT_VIEW_PROPERTY(onTextSelected, RCTBubblingEventBlock)"
    );
  });

  it("emits selected text with the first page and per-line bounds", () => {
    const body = methodBody("emitCurrentSelectionIfNeeded");

    expect(body).toContain("self.pdfView.currentSelection");
    expect(body).toContain("selection.pages.firstObject");
    expect(body).toContain("selection.selectionsByLine");
    expect(body).toContain('@"text" : text');
    expect(body).toContain('@"pageIndex" : @(pageIndex)');
    expect(body).toContain('@"rects" : rects');
  });

  it("selects a whole PDFKit word on double tap", () => {
    const body = methodBody("handleDocumentDoubleTap:");

    expect(body).toContain("selectionForWordAtPoint:");
    expect(body).toContain("self.pdfView.currentSelection = selection;");
  });

  it("clears native selection after a tap outside it or an inactive prop", () => {
    const tapBody = methodBody("handleDocumentTap:");
    const inactiveBody = methodBody("setSelectionActive:");

    expect(tapBody).toContain("selectionContainsViewPoint:viewPoint");
    expect(tapBody).toMatch(/\[self clearCurrentSelection\];\s*return;/);
    expect(inactiveBody).toContain("if (!selectionActive)");
    expect(inactiveBody).toContain("clearCurrentSelection");
    expect(manager).toContain("RCT_EXPORT_VIEW_PROPERTY(selectionActive, BOOL)");
  });

  it("adds Define to the iOS edit menu while preserving PDFKit actions", () => {
    const selectionBody = methodBody("emitCurrentSelectionIfNeeded");
    const scheduleBody = bodyAfterSignature(
      "scheduleSelectionEditMenuForSignature:(NSString *)signature {"
    );
    const attemptBody = bodyAfterSignature(
      "attemptSelectionEditMenuForSignature:(NSString *)signature generation:(NSUInteger)generation"
    );
    const activeGestureBody = bodyAfterSignature(
      "hasActiveGestureInView:(UIView *)view"
    );
    const menuBody = bodyAfterSignature(
      "menuForConfiguration:(UIEditMenuConfiguration *)configuration"
    );

    expect(source).toContain("<UIEditMenuInteractionDelegate,");
    expect(source).toContain("UIEditMenuInteraction *editMenuInteraction");
    expect(source).toContain("initWithDelegate:self");
    expect(source).toContain("addInteraction:_editMenuInteraction");
    expect(source).toContain("presentEditMenuWithConfiguration:");
    expect(source).toContain("@available(iOS 16.0, *)");
    expect(selectionBody).toContain("scheduleSelectionEditMenuForSignature:");
    expect(scheduleBody).toContain("attemptSelectionEditMenuForSignature:");
    expect(attemptBody).toContain("hasActiveGestureInView:self.pdfView");
    expect(attemptBody).toContain("dispatch_after");
    expect(activeGestureBody).toContain("UIGestureRecognizerStateBegan");
    expect(activeGestureBody).toContain("UIGestureRecognizerStateChanged");
    expect(menuBody).toContain("suggestedActions");
    expect(menuBody).toContain("self.defineLabel");
    expect(menuBody).toContain("self.onDefineSelection");
    expect(header).toContain("RCTBubblingEventBlock onDefineSelection");
    expect(header).toContain("NSString *defineLabel");
    expect(engineIndex).toContain("onDefineSelection?:");
    expect(engineIndex).toContain("defineLabel?: string");
    expect(manager).toContain(
      "RCT_EXPORT_VIEW_PROPERTY(onDefineSelection, RCTBubblingEventBlock)"
    );
    expect(manager).toContain("RCT_EXPORT_VIEW_PROPERTY(defineLabel, NSString)");
  });

  it("reconstructs temporary PDFKit highlights from normalized search rects", () => {
    const resultsSetter = bodyAfterSignature(
      "setSearchResults:(NSArray<NSDictionary *> *)searchResults {"
    );
    const activeIndexSetter = bodyAfterSignature(
      "setActiveSearchIndex:(NSInteger)activeSearchIndex {"
    );
    const rebuildBody = bodyAfterSignature("rebuildSearchHighlights {");
    const colorBody = bodyAfterSignature(
      "updateSearchHighlightColorsFromResultIndex:(NSInteger)previousSearchIndex {"
    );
    const reloadBody = methodBody("reloadDocumentFromStore");

    expect(iosViewer).toContain("const searchResults = useViewerStore");
    expect(iosViewer).toContain("const activeSearchIndex = useViewerStore");
    expect(iosViewer).toContain("searchResults={searchResults}");
    expect(iosViewer).toContain("activeSearchIndex={activeSearchIndex}");
    expect(engineIndex).toContain("activeSearchIndex?: number");
    expect(header).toContain("NSArray<NSDictionary *> *searchResults");
    expect(header).toContain("NSInteger activeSearchIndex");
    expect(manager).toContain("RCT_EXPORT_VIEW_PROPERTY(searchResults, NSArray)");
    expect(manager).toContain(
      "RCT_EXPORT_VIEW_PROPERTY(activeSearchIndex, NSInteger)"
    );
    expect(resultsSetter).toContain("rebuildSearchHighlights");
    expect(activeIndexSetter).toContain("updateSearchHighlightColors");
    expect(reloadBody).toContain("rebuildSearchHighlights");
    expect(rebuildBody).toContain("pageAtIndex:");
    expect(rebuildBody).toContain("selectionForRect:");
    expect(rebuildBody).toContain("highlightedSelections = nil");
    expect(rebuildBody).toContain("self.pdfView.highlightedSelections =");
    expect(rebuildBody).toContain("selectionsByResultIndex[@(resultIndex)] = match");
    expect(rebuildBody).toContain("self.searchSelectionsByResultIndex =");
    expect(rebuildBody).toContain(
      "scheduleNavigationToSearchResultAtIndex:self.activeSearchIndex"
    );
    expect(rebuildBody).toContain("[pageIndexValue isKindOfClass:NSNumber.class]");
    expect(rebuildBody).toContain("floor(pageIndexNumber) != pageIndexNumber");
    expect(rebuildBody).toContain("isfinite(pageIndexNumber)");
    expect(rebuildBody).not.toContain("currentSelection");
    expect(colorBody).toContain("self.activeSearchIndex");
    expect(colorBody).toContain(
      "self.searchSelectionsByResultIndex[@(self.activeSearchIndex)]"
    );
    expect(colorBody).toContain("previousSelection.color");
    expect(colorBody).toContain("activeSelection.color");
    expect(colorBody).not.toContain("currentSelection");
  });

  it("navigates to the active match after React Native applies the prop batch", () => {
    const activeIndexSetter = bodyAfterSignature(
      "setActiveSearchIndex:(NSInteger)activeSearchIndex {"
    );
    const navigationBody = bodyAfterSignature(
      "scheduleNavigationToSearchResultAtIndex:(NSInteger)activeSearchIndex {"
    );

    expect(activeIndexSetter).toContain(
      "NSInteger previousSearchIndex = _activeSearchIndex;"
    );
    expect(activeIndexSetter).toContain(
      "updateSearchHighlightColorsFromResultIndex:previousSearchIndex"
    );
    expect(activeIndexSetter).toContain(
      "scheduleNavigationToSearchResultAtIndex:activeSearchIndex"
    );
    expect(navigationBody).toContain("dispatch_async(dispatch_get_main_queue()");
    expect(navigationBody).toContain(
      "self.searchNavigationGeneration != generation"
    );
    expect(navigationBody).toContain(
      "self.activeSearchIndex != activeSearchIndex"
    );
    expect(navigationBody).toContain(
      "self.searchSelectionsByResultIndex[@(activeSearchIndex)]"
    );
    expect(navigationBody).toContain("[self.pdfView goToSelection:selection]");
    expect(navigationBody).not.toContain("currentSelection");
  });

  it("recolors only the previously active and newly active matches", () => {
    const colorBody = bodyAfterSignature(
      "updateSearchHighlightColorsFromResultIndex:(NSInteger)previousSearchIndex {"
    );

    expect(colorBody).toContain(
      "self.searchSelectionsByResultIndex[@(previousSearchIndex)]"
    );
    expect(colorBody).toContain(
      "self.searchSelectionsByResultIndex[@(self.activeSearchIndex)]"
    );
    expect(colorBody).not.toContain("enumerateObjectsUsingBlock");
    expect(colorBody).not.toContain("currentSelection");
  });
});
