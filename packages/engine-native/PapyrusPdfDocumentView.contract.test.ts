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

describe("PapyrusPdfDocumentView native text selection", () => {
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
});
