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
      "NSString *annotateLabel",
      "NSString *annotationHighlightLabel",
      "NSString *annotationUnderlineLabel",
      "NSString *annotationStrikeoutLabel",
      "NSString *annotationSquigglyLabel",
      "NSString *annotationNoteLabel",
      "RCTBubblingEventBlock onAnnotationCreated",
      "RCTBubblingEventBlock onAnnotationTap",
    ]) {
      expect(header).toContain(property);
    }
    for (const property of [
      "annotations, NSArray",
      "activeTool, NSString",
      "annotationColor, NSString",
      "annotationOpacity, CGFloat",
      "selectedAnnotationId, NSString",
      "annotateLabel, NSString",
      "annotationHighlightLabel, NSString",
      "annotationUnderlineLabel, NSString",
      "annotationStrikeoutLabel, NSString",
      "annotationSquigglyLabel, NSString",
      "annotationNoteLabel, NSString",
      "onAnnotationCreated, RCTBubblingEventBlock",
      "onAnnotationTap, RCTBubblingEventBlock",
    ]) {
      expect(manager).toContain(`RCT_EXPORT_VIEW_PROPERTY(${property})`);
    }
    expect(engineIndex).toContain("annotations?: Annotation[]");
    expect(engineIndex).toContain("selectedAnnotationId?: string | null");
    expect(engineIndex).toContain("onAnnotationCreated?:");
    expect(engineIndex).toContain("onAnnotationTap?:");
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
    ]) {
      expect(iosViewer).toContain(selector);
    }
    for (const prop of [
      "annotations={annotations}",
      "activeTool={activeTool}",
      "annotationColor={annotationColor}",
      "annotationOpacity={annotationOpacity}",
      "selectedAnnotationId={selectedAnnotationId}",
      "annotateLabel={t.annotate}",
      "annotationHighlightLabel={t.annotationHighlight}",
      "annotationUnderlineLabel={t.annotationUnderline}",
      "annotationStrikeoutLabel={t.annotationStrikeout}",
      "annotationSquigglyLabel={t.annotationSquiggly}",
      "annotationNoteLabel={t.annotationNote}",
      "onAnnotationCreated",
      "onAnnotationTap",
    ]) {
      expect(iosViewer).toContain(prop);
    }
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
      '@"Squiggly"',
      '@"PapyrusComment"',
    ]) {
      expect(create).toContain(subtype);
    }
    expect(create).toContain("quadrilateralPoints");
    expect(source).toContain("PapyrusSquigglyPdfAnnotation");
    expect(source).toContain("PapyrusCommentPdfAnnotation");
    expect(source).toContain("colorWithAlphaComponent");
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
    expect(menu).toContain("self.onAnnotationCreated");
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
