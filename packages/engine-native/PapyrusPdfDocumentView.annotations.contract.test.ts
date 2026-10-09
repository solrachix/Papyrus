import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const source = read("packages/engine-native/ios/PapyrusPdfDocumentView.m");
const header = read("packages/engine-native/ios/PapyrusPdfDocumentView.h");
const manager = read("packages/engine-native/ios/PapyrusPdfDocumentViewManager.m");
const engineIndex = read("packages/engine-native/index.ts");
const iosViewer = read("packages/ui-react-native/components/DedicatedIosPdfViewer.tsx");

const method = (signature: string) => {
  let searchFrom = 0;
  while (true) {
    const start = source.indexOf(signature, searchFrom);
    if (start < 0) throw new Error(`Missing Objective-C method: ${signature}`);
    const bodyStart = source.indexOf("{", start);
    const declarationEnd = source.indexOf(";", start);
    if (bodyStart >= 0 && (declarationEnd < 0 || bodyStart < declarationEnd)) {
      let depth = 0;
      for (let index = bodyStart; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        if (source[index] === "}" && --depth === 0) {
          return source.slice(bodyStart, index + 1);
        }
      }
      throw new Error(`Unterminated Objective-C method: ${signature}`);
    }
    searchFrom = start + signature.length;
  }
};

describe("Papyrus iOS PDF annotation bridge", () => {
  it("exports annotation inputs, selected id, menu labels and callbacks", () => {
    for (const property of [
      "NSArray<NSDictionary *> *annotations",
      "NSString *activeTool",
      "NSString *annotationColor",
      "CGFloat annotationOpacity",
      "NSString *selectedAnnotationId",
      "NSString *annotationSelectionColor",
      "NSString *annotationDeleteLabel",
      "NSString *annotateLabel",
      "NSString *annotationHighlightLabel",
      "NSString *annotationUnderlineLabel",
      "NSString *annotationStrikeoutLabel",
      "NSString *annotationSquigglyLabel",
      "NSString *annotationNoteLabel",
      "RCTBubblingEventBlock onAnnotationCreated",
      "RCTBubblingEventBlock onAnnotationTap",
      "RCTBubblingEventBlock onAnnotationDelete",
      "RCTBubblingEventBlock onAnnotationDeselected",
    ]) {
      expect(header).toContain(property);
    }
    for (const property of [
      "annotations, NSArray",
      "activeTool, NSString",
      "annotationColor, NSString",
      "annotationOpacity, CGFloat",
      "selectedAnnotationId, NSString",
      "annotationSelectionColor, NSString",
      "annotationDeleteLabel, NSString",
      "annotateLabel, NSString",
      "annotationHighlightLabel, NSString",
      "annotationUnderlineLabel, NSString",
      "annotationStrikeoutLabel, NSString",
      "annotationSquigglyLabel, NSString",
      "annotationNoteLabel, NSString",
      "onAnnotationCreated, RCTBubblingEventBlock",
      "onAnnotationTap, RCTBubblingEventBlock",
      "onAnnotationDelete, RCTBubblingEventBlock",
      "onAnnotationDeselected, RCTBubblingEventBlock",
    ]) {
      expect(manager).toContain(`RCT_EXPORT_VIEW_PROPERTY(${property})`);
    }
    expect(engineIndex).toContain("annotations?: Annotation[]");
    expect(engineIndex).toContain("selectedAnnotationId?: string | null");
    expect(engineIndex).toContain("annotationSelectionColor?: string");
    expect(engineIndex).toContain("annotationDeleteLabel?: string");
    expect(engineIndex).toContain("onAnnotationCreated?:");
    expect(engineIndex).toContain("onAnnotationTap?:");
    expect(engineIndex).toContain("onAnnotationDelete?:");
    expect(engineIndex).toContain("onAnnotationDeselected?:");
  });

  it("passes the store annotation state and native callbacks from the iOS viewer", () => {
    for (const selector of [
      "state.annotations",
      "state.activeTool",
      "state.annotationColor",
      "state.annotationOpacity",
      "state.selectedAnnotationId",
      "state.addAnnotation",
      "state.setSelectedAnnotation",
      "state.removeAnnotation",
      "state.accentColor",
    ]) {
      expect(iosViewer).toContain(selector);
    }
    for (const prop of [
      "annotations={annotations.filter",
      "activeTool={activeTool}",
      "annotationColor={annotationColor}",
      "annotationOpacity={annotationOpacity}",
      "selectedAnnotationId={selectedAnnotationId}",
      "annotationSelectionColor={annotationSelectionColor}",
      "annotationDeleteLabel={t.deleteAnnotation}",
      "annotateLabel={t.annotate}",
      "annotationHighlightLabel={t.annotationHighlight}",
      "annotationUnderlineLabel={t.annotationUnderline}",
      "annotationStrikeoutLabel={t.annotationStrikeout}",
      "annotationSquigglyLabel={t.annotationSquiggly}",
      "annotationNoteLabel={t.annotationNote}",
      "onAnnotationCreated",
      "onAnnotationTap",
      "onAnnotationDelete",
      "onAnnotationDeselected",
    ]) {
      expect(iosViewer).toContain(prop);
    }
  });

  it("applies single-word Define policy to the iOS pre-16 fallback action", () => {
    expect(iosViewer).toContain(
      "shouldShowDefineSelection(selection.text, defineSelectionMode)"
    );
  });

  it("builds annotations from current selection line bounds and emits intent to JS", () => {
    const create = method("- (void)emitAnnotationFromCurrentSelectionWithType:");
    expect(create).toContain("self.pdfView.currentSelection");
    expect(create).toContain("selection.selectionsByLine");
    expect(create).toContain("PapyrusNormalizedSelectionRect");
    expect(create).toContain('@"rects" : rects');
    expect(create).toContain('@"rect" :');
    expect(create).toContain('@"content" :');
    expect(create).toContain("self.onAnnotationCreated");
    expect(create).toContain("createdAt");
  });

  it("reconciles only Papyrus-owned PDF annotations incrementally", () => {
    const reconcile = method("- (void)reconcilePapyrusAnnotations");
    const clear = method("- (void)clearPapyrusAnnotationsForDocument:");
    expect(source).toContain("papyrusAnnotationsById");
    expect(source).toContain("papyrusAnnotationIdsByObject");
    expect(reconcile).toContain("annotationSignature");
    expect(reconcile).toContain("removePapyrusAnnotationWithId:");
    expect(reconcile).toContain("createPdfAnnotationsForPapyrusAnnotation:");
    expect(reconcile).toContain("[self.pdfView setNeedsDisplay]");
    expect(clear).toContain("page removeAnnotation:annotation");
    expect(clear).toContain("papyrusAnnotationsById removeAllObjects");
    expect(method("- (void)reloadDocumentFromStore")).toContain(
      "clearPapyrusAnnotationsForDocument:self.pdfView.document"
    );
    expect(reconcile).not.toContain("page.annotations");
  });

  it("draws selected annotation outlines as a separate temporary PDFKit layer", () => {
    const setter = method("- (void)setSelectedAnnotationId:");
    const update = method("- (void)updateSelectedAnnotationAdornment");
    const clear = method("- (void)removeSelectedAnnotationAdornment");
    expect(setter).toContain("updateSelectedAnnotationAdornment");
    expect(update).toContain("papyrusAnnotationsById");
    expect(update).toContain("PapyrusSelectionOutlinePdfAnnotation");
    expect(update).toContain("annotationSelectionColor");
    expect(update).toContain("selectedAnnotationAdornmentAnnotations");
    expect(update).toContain("addAnnotation:");
    expect(update).not.toContain("self.annotations =");
    expect(update).not.toMatch(/papyrusAnnotationsById\[[^\]]+\]\s*=/);
    expect(update).not.toContain("currentSelection =");
    expect(update).not.toContain("highlightedSelections =");
    expect(clear).toContain("removeAnnotation:");
    expect(clear).toContain("selectedAnnotationAdornmentAnnotations = @[]");
    expect(method("- (void)reconcilePapyrusAnnotations")).toContain(
      "updateSelectedAnnotationAdornment"
    );
  });

  it("routes native Delete through JS and clears annotation selection when its menu closes", () => {
    const menu = method("- (nullable UIMenu *)editMenuInteraction:");
    const emitDelete = method("- (void)emitAnnotationDeleteWithId:");
    const dismissed = method(
      "- (void)editMenuInteraction:(UIEditMenuInteraction *)interaction\n    willDismissMenuForConfiguration:"
    );
    const present = method("- (void)presentAnnotationEditMenuForId:");
    const tap = method("- (void)handleDocumentTap:");
    expect(menu).toContain("contextualAnnotationMenuId");
    expect(menu).toContain("self.annotationDeleteLabel");
    expect(menu).toContain("self.onAnnotationDelete");
    expect(menu).toContain("emitAnnotationDeleteWithId:");
    expect(dismissed).toContain("onAnnotationDeselected");
    expect(present).toContain("[[NSUUID UUID] UUIDString]");
    expect(tap).toContain("presentAnnotationEditMenuForId:");
    expect(tap).toContain("onAnnotationTap");
    expect(tap).toContain("return;");
    expect(method("- (void)emitAnnotationDeleteWithId:")).toContain(
      "self.onAnnotationDelete(@{@\"id\" : annotationId})"
    );
    expect(emitDelete).not.toContain("removePapyrusAnnotationWithId:");
    expect(emitDelete).toContain("papyrusAnnotationsById[annotationId]");
    expect(iosViewer).toMatch(
      /const handleTap = useCallback\(\(\) => \{\s*setSelectedAnnotation\(null\);/
    );
    expect(iosViewer).toMatch(
      /if \(nextSelection\) \{[\s\S]*?\} else \{\s*setSelectedAnnotation\(null\);/
    );
    expect(iosViewer).toContain("handleDeleteAnnotation(event.nativeEvent.id)");
    expect(iosViewer).toContain("setSelectedAnnotation(null)");
    expect(iosViewer).toContain("onAnnotationDeselected");
  });

  it("invalidates contextual deletion before switching the PDF document", () => {
    const reload = method("- (void)reloadDocumentFromStore");
    const reset = method("- (void)dismissAnnotationMenuForDocumentChange");
    const menu = method("- (nullable UIMenu *)editMenuInteraction:");
    const resetIndex = reload.indexOf("dismissAnnotationMenuForDocumentChange");
    const documentSwapIndex = reload.indexOf("self.pdfView.document = document");
    expect(resetIndex).toBeGreaterThanOrEqual(0);
    expect(resetIndex).toBeLessThan(documentSwapIndex);
    expect(reset).toContain("dismissMenu");
    expect(reset).toContain("contextualAnnotationMenuId = nil");
    expect(reset).toContain("contextualAnnotationMenuConfigurationId = nil");
    expect(reset).toContain("onAnnotationDeselected");
    expect(reset).not.toContain("return;");
    expect(menu).toContain("documentAtPresentation");
    expect(menu).toContain("strongSelf.pdfView.document != documentAtPresentation");
  });

  it("maps normalized crop-box coordinates once for annotations and search", () => {
    expect(source).toContain("PapyrusPdfRectFromNormalizedRect");
    expect(method("- (void)rebuildSearchHighlights")).toContain(
      "PapyrusPdfRectFromNormalizedRect"
    );
    expect(method("- (NSArray<PDFAnnotation *> *)createPdfAnnotationsForPapyrusAnnotation:")).toContain(
      "PapyrusPdfRectFromNormalizedRect"
    );
    expect(source).toContain("kPDFDisplayBoxCropBox");
  });

  it("renders each supported Papyrus text annotation type with its own appearance", () => {
    const create = method("- (NSArray<PDFAnnotation *> *)createPdfAnnotationsForPapyrusAnnotation:");
    for (const subtype of [
      '@"Highlight"',
      '@"Underline"',
      '@"StrikeOut"',
      '@"Stamp"',
    ]) {
      expect(create).toContain(subtype);
    }
    expect(create).toContain("quadrilateralPoints");
    expect(source).toContain("PapyrusSquigglyPdfAnnotation");
    expect(source).toContain("PapyrusCommentPdfAnnotation");
    expect(source).toContain("colorWithAlphaComponent");
  });

  it("uses one dealloc to release observers and Papyrus-owned annotations", () => {
    const deallocs = [...source.matchAll(/- \(void\)dealloc\s*\{/g)];
    expect(deallocs).toHaveLength(1);
    const dealloc = method("- (void)dealloc");
    for (const cleanup of [
      "stopObservingScrollView",
      "removeObserver:self",
      "self.tapRecognizer.delegate = nil",
      "self.doubleTapRecognizer.delegate = nil",
      "clearPapyrusAnnotationsForDocument:self.pdfView.document",
    ]) {
      expect(dealloc).toContain(cleanup);
    }
  });

  it("uses a supported PDFKit carrier subtype for custom comment and squiggly drawing", () => {
    const create = method("- (NSArray<PDFAnnotation *> *)createPdfAnnotationsForPapyrusAnnotation:");
    expect(create).toContain("PapyrusSquigglyPdfAnnotation");
    expect(create).toContain("PapyrusCommentPdfAnnotation");
    expect(create).not.toContain('@"Squiggly"');
    expect(create).not.toContain('@"PapyrusComment"');
    expect(create).toContain('@"Stamp"');
  });

  it("keeps PDF annotations separate from selection and temporary search highlights", () => {
    const create = method("- (NSArray<PDFAnnotation *> *)createPdfAnnotationsForPapyrusAnnotation:");
    const reconcile = method("- (void)reconcilePapyrusAnnotations");
    expect(create).not.toContain("currentSelection =");
    expect(create).not.toContain("highlightedSelections =");
    expect(reconcile).not.toContain("currentSelection =");
    expect(reconcile).not.toContain("highlightedSelections =");
    expect(source).toContain("selectionForRect:");
    expect(source).toContain("highlightedSelections =");
  });

  it("does not serialize Papyrus annotations into the source PDF", () => {
    expect(source).not.toContain("dataRepresentation");
    expect(source).not.toContain("writeToURL:");
    expect(source).not.toContain("writeToFile:");
  });

  it("adds Define and a localized Annotate submenu without replacing system actions", () => {
    const menu = method("- (nullable UIMenu *)editMenuInteraction:");
    const attempt = method("- (void)attemptSelectionEditMenuForSignature:");
    expect(menu).toContain("suggestedActions");
    expect(menu).toContain("self.onDefineSelection");
    expect(menu).toContain("self.defineSelectionMode");
    expect(menu).toContain("isSingleWordSelection");
    expect(menu).toContain("self.onAnnotationCreated");
    expect(menu.indexOf("actions addObject:defineAction")).toBeLessThan(
      menu.indexOf("addObjectsFromArray:suggestedActions")
    );
    expect(menu).toContain("UIMenu menuWithTitle:self.annotateLabel");
    for (const title of [
      "annotationHighlightLabel",
      "annotationUnderlineLabel",
      "annotationStrikeoutLabel",
      "annotationSquigglyLabel",
      "annotationNoteLabel",
    ]) {
      expect(menu).toContain(`self.${title}`);
    }
    expect(attempt).toContain("self.onDefineSelection");
    expect(attempt).toContain("self.onAnnotationCreated");
  });

  it("routes annotation taps and comment-tool taps without generic tap events", () => {
    const tap = method("- (void)handleDocumentTap:");
    expect(tap).toContain("papyrusAnnotationIdsByObject");
    expect(tap).toContain("onAnnotationTap");
    expect(tap).toContain('self.activeTool isEqualToString:@"comment"');
    expect(tap).toContain("emitCommentAtPage:");
    expect(tap).toContain("CGRectContainsPoint(pageViewBounds, viewPoint)");
    const genericTapIndex = tap.indexOf("if (self.onTap)");
    const annotationTapIndex = tap.indexOf("if (annotationId.length > 0)");
    const commentTapIndex = tap.indexOf('if ([self.activeTool isEqualToString:@"comment"])');
    expect(annotationTapIndex).toBeGreaterThan(-1);
    expect(commentTapIndex).toBeGreaterThan(-1);
    expect(annotationTapIndex).toBeLessThan(genericTapIndex);
    expect(commentTapIndex).toBeLessThan(genericTapIndex);
    expect(tap.slice(annotationTapIndex, genericTapIndex)).toContain("return;");
    expect(tap.slice(commentTapIndex, genericTapIndex)).toContain("return;");
    expect(tap).toContain("self.onTap");
  });

  it("drops the Papyrus registry on document changes without touching source annotations", () => {
    const reload = method("- (void)reloadDocumentFromStore");
    const clear = method("- (void)clearPapyrusAnnotationsForDocument:");
    expect(reload).toContain("clearPapyrusAnnotationsForDocument:self.pdfView.document");
    expect(clear).toContain("removeAnnotation:annotation");
    expect(clear).not.toContain("document.annotations");
    expect(clear).not.toContain("page.annotations");
  });
});
