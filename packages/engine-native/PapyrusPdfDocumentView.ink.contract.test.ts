import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const header = read("packages/engine-native/ios/PapyrusPdfDocumentView.h");
const source = read("packages/engine-native/ios/PapyrusPdfDocumentView.m");
const manager = read(
  "packages/engine-native/ios/PapyrusPdfDocumentViewManager.m"
);
const podspec = read("packages/engine-native/ios/PapyrusNativeEngine.podspec");
const engineIndex = read("packages/engine-native/index.ts");
const iosViewer = read(
  "packages/ui-react-native/components/DedicatedIosPdfViewer.tsx"
);
const toolDock = read("packages/ui-react-native/components/ToolDock.tsx");

describe("native PDF PencilKit overlay contract", () => {
  it("exports preset, width, and batched stroke commit through the native view", () => {
    expect(header).toContain("NSString *activeDrawToolPreset");
    expect(header).toContain("CGFloat inkStrokeWidth");
    expect(header).toContain("RCTBubblingEventBlock onInkDrawingCommitted");
    expect(manager).toContain("RCT_EXPORT_VIEW_PROPERTY(activeDrawToolPreset, NSString)");
    expect(manager).toContain("RCT_EXPORT_VIEW_PROPERTY(inkStrokeWidth, CGFloat)");
    expect(manager).toContain("RCT_EXPORT_VIEW_PROPERTY(onInkDrawingCommitted, RCTBubblingEventBlock)");
    expect(engineIndex).toContain("activeDrawToolPreset?: \"ink\" | \"highlight\" | \"underline\"");
    expect(engineIndex).toContain("onInkDrawingCommitted?:");
  });

  it("uses public page overlays and a finger-capable transparent canvas", () => {
    expect(source).toContain("PDFPageOverlayViewProvider");
    expect(source).toContain("_pdfView.pageOverlayViewProvider = self");
    expect(source).toContain("overlayViewForPage:(PDFPage *)page");
    expect(source).toContain("PKCanvasViewDrawingPolicyAnyInput");
    expect(source).toContain("canvas.backgroundColor = UIColor.clearColor");
    expect(source).toContain("canvas.opaque = NO");
    expect(source).toContain("canvas.scrollEnabled = NO");
  });

  it("reconstructs page drawings from store annotations and releases offscreen overlays", () => {
    expect(source).toContain("initWithStrokes:");
    expect(source).toContain('annotation[@"path"]');
    expect(source).toContain("willEndDisplayingOverlayView");
    expect(source).toContain("inkCanvasesByPageIndex removeObjectForKey");
    expect(source).toContain("applyingStoreDrawing");
    expect(source).toContain("inkAnnotationSignaturesByPageIndex");
    expect(source).toContain("PKEraserTypeVector");
  });

  it("commits normalized stroke batches at gesture end without persisting a PDF drawing", () => {
    expect(source).toContain("canvasViewDidEndUsingTool:");
    expect(source).toContain("onInkDrawingCommitted");
    expect(source).toContain('@"strokes"');
    expect(source).toContain('@"strokeWidth"');
    expect(source).toContain("normalizedPoint");
    expect(source).not.toContain("dataRepresentation");
    expect(source).not.toContain("writeToURL:");
  });

  it("derives a transformed median stroke width from PencilKit path points", () => {
    const payloadMethod = source.match(
      /- \(NSArray<NSDictionary \*> \*\)inkDrawingPayloadForCanvas:\(PapyrusPdfPageInkCanvasView \*\)canvas \{[\s\S]*?\n\}/
    )?.[0];

    expect(payloadMethod).toContain("strokePoint.size.width");
    expect(payloadMethod).toContain("stroke.transform");
    expect(payloadMethod).toContain("sqrt(fabs(");
    expect(payloadMethod).toContain("sortedArrayUsingSelector");
    expect(payloadMethod).not.toContain("stroke.ink.width");
  });

  it("round-trips PencilKit marker strokes through the universal opacity convention", () => {
    const payloadMethod = source.match(
      /- \(NSArray<NSDictionary \*> \*\)inkDrawingPayloadForCanvas:\(PapyrusPdfPageInkCanvasView \*\)canvas \{[\s\S]*?\n\}/
    )?.[0];

    expect(payloadMethod).toContain("stroke.ink.inkType");
    expect(payloadMethod).toContain("PKInkTypeMarker");
    expect(payloadMethod).toContain("MIN(opacity, 0.28)");
  });

  it("sends empty drawing batches so erasing a whole page removes its strokes", () => {
    const commitMethod = source.match(
      /- \(void\)commitInkDrawingForCanvas:\(PapyrusPdfPageInkCanvasView \*\)canvas \{[\s\S]*?\n\}/
    )?.[0];
    expect(commitMethod).toContain('onInkDrawingCommitted(@{');
    expect(commitMethod).toContain('@"strokes" : strokes');
    expect(commitMethod).not.toContain("strokes.count == 0");
  });

  it("rebinds the picker as PDFKit changes pages and detaches it off-window", () => {
    const pageChangeMethod = source.match(
      /- \(void\)handlePdfPageChanged:[\s\S]*?\n\}/
    )?.[0];
    expect(pageChangeMethod).toContain("updateInkCanvasInputAndPicker");
    expect(source).toContain("if (!self.window) {");
    expect(source).toContain("[self deactivateInkCanvas];");
  });

  it("keeps every visible page canvas synchronized with the shared tool picker", () => {
    const activationMethod = source.match(
      /- \(void\)activateInkCanvas:\(PapyrusPdfPageInkCanvasView \*\)canvas \{[\s\S]*?\n\}/
    )?.[0];
    const deactivationMethod = source.match(
      /- \(void\)deactivateInkCanvas \{[\s\S]*?\n\}/
    )?.[0];
    expect(source).toContain("observedToolPicker");
    expect(activationMethod).toContain("inkCanvasesByPageIndex.allValues");
    expect(activationMethod).toContain("[picker addObserver:visibleCanvas]");
    expect(deactivationMethod).toContain("[observedPicker removeObserver:visibleCanvas]");
  });

  it("passes native drawing config to the page view and commits through the Papyrus store", () => {
    expect(iosViewer).toContain("state.activeDrawToolPreset");
    expect(iosViewer).toContain("state.inkStrokeWidth");
    expect(iosViewer).toContain("activeDrawToolPreset={activeDrawToolPreset}");
    expect(iosViewer).toContain("inkStrokeWidth={inkStrokeWidth}");
    expect(iosViewer).toContain("onInkDrawingCommitted");
    expect(iosViewer).toContain("commitInkStrokesForPage");
  });

  it("links PencilKit and suppresses duplicate drawing controls while its picker is active", () => {
    expect(podspec).toContain("'PencilKit'");
    expect(toolDock).toContain("nativeInkToolPickerActive");
    expect(toolDock).toContain("shouldShowToolDockInkControls");
  });
});
