import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const themeSource = read("packages/engine-native/ios/PapyrusPdfPageTheme.m");
const themeHeader = read("packages/engine-native/ios/PapyrusPdfPageTheme.h");
const store = read("packages/engine-native/ios/PapyrusEngineStore.m");
const nativeEngine = read("packages/engine-native/ios/PapyrusNativeEngine.m");
const pageView = read("packages/engine-native/ios/PapyrusPdfDocumentView.m");
const compatPageView = read("packages/engine-native/ios/PapyrusPageView.m");
const viewerMode = read("packages/ui-react-native/components/nativePdfViewerMode.ts");
const viewer = read("packages/ui-react-native/components/Viewer.tsx");

const method = (source: string, signature: string) => {
  let searchFrom = 0;
  while (true) {
    const start = source.indexOf(signature, searchFrom);
    if (start < 0) throw new Error(`Missing source method: ${signature}`);
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
      throw new Error(`Unterminated method body: ${signature}`);
    }
    searchFrom = start + signature.length;
  }
};

describe("Papyrus native PDF page themes", () => {
  it("registers and strongly retains a page delegate on each exact PDFDocument", () => {
    expect(themeHeader).toContain("PapyrusInstallPdfPageThemeDelegate");
    expect(themeHeader).toContain("PapyrusAcquirePdfPageThemeLease");
    expect(themeHeader).toContain("PapyrusUpdatePdfPageThemeLease");
    expect(themeHeader).toContain("PapyrusReleasePdfPageThemeLease");
    expect(themeSource).toContain("classForPage");
    expect(themeSource).toContain("PapyrusThemedPdfPage.class");
    expect(themeSource).toContain("objc_setAssociatedObject");
    expect(themeSource).toContain("OBJC_ASSOCIATION_RETAIN_NONATOMIC");
    expect(themeSource).toContain("document.delegate = delegate");
    expect(themeSource).not.toMatch(/strong\s+PDFDocument\s*\*/);

    const setDocument = method(store, "- (void)setDocument:");
    expect(setDocument).toContain("PapyrusInstallPdfPageThemeDelegate(document)");
    expect(nativeEngine.indexOf("setDocument:document")).toBeLessThan(
      nativeEngine.indexOf("document.pageCount")
    );
  });

  it("uses unique per-view lease tokens and releases only the matching lease", () => {
    const acquire = method(themeSource, "NSString *PapyrusAcquirePdfPageThemeLease(");
    const update = method(themeSource, "void PapyrusUpdatePdfPageThemeLease(");
    const release = method(themeSource, "void PapyrusReleasePdfPageThemeLease(");
    const setTheme = method(themeSource, "- (void)setTheme:");
    const removeLease = method(themeSource, "- (void)removeLease:");
    expect(acquire).toContain("NSUUID");
    expect(acquire).toContain("setTheme:theme forLease:leaseToken");
    expect(setTheme).toContain("themesByLease[leaseToken]");
    expect(update).toContain("setTheme:theme forLease:leaseToken");
    expect(release).toContain("removeLease:leaseToken");
    expect(removeLease).toContain("removeObjectForKey:leaseToken");
    expect(release).not.toContain("removeAllObjects");
  });

  it("draws PDF page content without mutating shared annotation flags", () => {
    const draw = method(themeSource, "- (void)drawWithBox:");
    const contentIndex = draw.indexOf("CGContextDrawPDFPage");
    const themeIndex = draw.indexOf("PapyrusApplyPageTheme");
    const annotationIndex = draw.indexOf("for (PDFAnnotation *annotation");
    const annotationDrawIndex = draw.indexOf("drawWithBox:box inContext:context");
    expect(draw).toContain("[super drawWithBox:box toContext:context]");
    expect(draw).toContain("[self transformContext:context forBox:box]");
    expect(draw).toContain("self.pageRef");
    expect(draw).toContain("self.displaysAnnotations");
    expect(contentIndex).toBeGreaterThanOrEqual(0);
    expect(themeIndex).toBeGreaterThan(contentIndex);
    expect(annotationIndex).toBeGreaterThan(themeIndex);
    expect(annotationDrawIndex).toBeGreaterThan(annotationIndex);
    expect(themeSource).not.toMatch(/displaysAnnotations\s*=/);
    expect(draw).not.toContain("currentSelection");
    expect(draw).not.toContain("highlightedSelections");
  });

  it("defines separate Core Graphics treatments for sepia, dark and contrast", () => {
    const applyTheme = method(themeSource, "static void PapyrusApplyPageTheme(");
    expect(applyTheme).toContain('isEqualToString:@"sepia"');
    expect(applyTheme).toContain("kCGBlendModeMultiply");
    expect(applyTheme).toContain('isEqualToString:@"dark"');
    expect(applyTheme).toContain("kCGBlendModeSaturation");
    expect(applyTheme).toContain("kCGBlendModeDifference");
    expect(applyTheme).toContain('isEqualToString:@"high-contrast"');
    expect(applyTheme).toContain("kCGBlendModeColorDodge");
    expect(method(themeSource, "- (void)drawWithBox:")).toContain(
      "[self boundsForBox:box]"
    );
  });

  it("updates and releases the view lease without replacing the PDF document", () => {
    const setTheme = method(pageView, "- (void)setPageTheme:");
    const updateLease = method(
      pageView,
      "- (void)acquireOrUpdatePageThemeLeaseForDocument:"
    );
    const releaseLease = method(
      pageView,
      "- (void)releasePageThemeLeaseForDocument:"
    );
    const reload = method(pageView, "- (void)reloadDocumentFromStore");
    const dealloc = method(pageView, "- (void)dealloc");
    expect(pageView).toContain("pageThemeLeaseToken");
    expect(setTheme).toContain("acquireOrUpdatePageThemeLeaseForDocument:");
    expect(updateLease).toContain("PapyrusUpdatePdfPageThemeLease");
    expect(setTheme).toContain("PapyrusInvalidateViewTree");
    expect(setTheme).not.toContain("self.pdfView.document =");
    expect(setTheme).not.toContain("self.currentPage =");
    expect(setTheme).not.toContain("self.zoom =");
    expect(reload).toContain("releasePageThemeLeaseForDocument:");
    expect(releaseLease).toContain("PapyrusReleasePdfPageThemeLease");
    expect(reload).toContain("PapyrusAcquirePdfPageThemeLease");
    expect(dealloc).toContain("releasePageThemeLeaseForDocument:");
  });

  it("releases and invalidates the theme lease when the native view detaches", () => {
    const didMoveToWindow = method(pageView, "- (void)didMoveToWindow");
    const detachedStart = didMoveToWindow.indexOf("if (!self.window)");
    const detachedEnd = didMoveToWindow.indexOf("return;", detachedStart);
    const detachedBranch = didMoveToWindow.slice(detachedStart, detachedEnd);

    expect(detachedStart).toBeGreaterThanOrEqual(0);
    expect(detachedBranch).toContain(
      "releasePageThemeLeaseForDocument:self.pdfView.document"
    );
    expect(detachedBranch).toContain("PapyrusInvalidateViewTree(self.pdfView)");
  });

  it("reacquires and invalidates the theme lease when the native view reattaches", () => {
    const didMoveToWindow = method(pageView, "- (void)didMoveToWindow");
    const detachedStart = didMoveToWindow.indexOf("if (!self.window)");
    const detachedEnd = didMoveToWindow.indexOf("return;", detachedStart);
    const attachedBranch = didMoveToWindow.slice(detachedEnd + "return;".length);

    expect(attachedBranch).toContain(
      "acquireOrUpdatePageThemeLeaseForDocument:self.pdfView.document"
    );
    expect(attachedBranch).toContain("PapyrusInvalidateViewTree(self.pdfView)");
    expect(attachedBranch.indexOf("acquireOrUpdatePageThemeLeaseForDocument:"))
      .toBeLessThan(attachedBranch.indexOf("PapyrusInvalidateViewTree(self.pdfView)"));
  });

  it("does not acquire a page theme lease for detached theme or document updates", () => {
    const setTheme = method(pageView, "- (void)setPageTheme:");
    const reload = method(pageView, "- (void)reloadDocumentFromStore");

    expect(setTheme).toMatch(
      /if \(self\.window\)\s*\{\s*\[self acquireOrUpdatePageThemeLeaseForDocument:self\.pdfView\.document\];\s*\}\s*else\s*\{\s*\[self releasePageThemeLeaseForDocument:self\.pdfView\.document\];/
    );
    expect(reload).toMatch(
      /if \(self\.pdfView\.document == document\)\s*\{\s*if \(self\.window\)\s*\{\s*\[self acquireOrUpdatePageThemeLeaseForDocument:document\];/
    );
    expect(reload).toMatch(
      /if \(document && self\.window\)\s*\{\s*self\.pageThemeLeaseToken\s*=\s*PapyrusAcquirePdfPageThemeLease\(document, self\.pageTheme\);/
    );
  });

  it("keeps compatibility rendering and native routing unchanged outside theme support", () => {
    expect(compatPageView).toContain("CISepiaTone");
    expect(compatPageView).toContain("CIColorInvert");
    expect(viewerMode).not.toContain('pageTheme === "normal"');
    expect(viewerMode).not.toContain('pageTheme !== "normal"');
    expect(viewer).not.toContain('"unsupported-page-theme"');
    expect(viewerMode).toContain('if (implementation === "android") return true;');
  });
});
