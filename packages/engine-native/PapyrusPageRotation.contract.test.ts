import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const readIfPresent = (path: string) =>
  existsSync(resolve(process.cwd(), path)) ? read(path) : "";

const pageView = read("packages/engine-native/ios/PapyrusPageView.m");
const documentView = read("packages/engine-native/ios/PapyrusPdfDocumentView.m");
const registry = readIfPresent(
  "packages/engine-native/ios/PapyrusPageRotationRegistry.m"
);

const methodBody = (source: string, signature: string): string => {
  const signatureIndex = source.indexOf(signature);
  if (signatureIndex < 0) throw new Error(`Missing method ${signature}`);
  const bodyStart = source.indexOf("{", signatureIndex);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  throw new Error(`Unterminated method ${signature}`);
};

describe("Papyrus PDF page rotation lifecycle", () => {
  it("applies source rotation plus viewer rotation through a shared lease", () => {
    expect(pageView).toContain("PapyrusPageRotationRegistry");
    expect(pageView).toContain("applyViewerRotation:");
    expect(pageView).toContain("pageRotationLease");
    expect(pageView).not.toContain("page.rotation = (int)rotation;");
    expect(registry).toContain("normalizeRotation:");
    expect(registry).toContain("originalRotation + viewerRotation");
  });

  it("uses document identity and generation-scoped concurrent leases", () => {
    expect(registry).toContain("NSMapTable<PDFDocument *");
    expect(registry).toContain("leaseTokens");
    expect(registry).toContain("generation");
    expect(registry).toContain("lease.generation != currentGeneration");
    expect(registry).toContain("if (record.leaseTokens.count > 0) return;");
  });

  it("calls the records lookup method with Objective-C message syntax", () => {
    expect(registry).not.toContain("self.recordsForDocument:");
    expect(registry).toContain("[self recordsForDocument:document create:NO]");
  });

  it("releases a page lease on page/document reuse and view deallocation", () => {
    expect(pageView).toContain("releasePageRotationLease");
    expect(pageView).toContain("- (void)dealloc");
    const renderMethod = methodBody(pageView, "- (void)renderWithDocument:");
    const deallocMethod = methodBody(pageView, "- (void)dealloc");
    const releaseOnReuseIndex = renderMethod.indexOf(
      "if (!isSamePage) [self releasePageRotationLease];"
    );
    const updatePageIndex = renderMethod.indexOf("self.currentDocument = document;");

    expect(renderMethod).toContain("releasePageRotationLease");
    expect(releaseOnReuseIndex).toBeGreaterThanOrEqual(0);
    expect(updatePageIndex).toBeGreaterThan(releaseOnReuseIndex);
    expect(deallocMethod).toContain("releasePageRotationLease");
  });

  it("restores every touched page before the native PDFView attaches a document", () => {
    const reloadMethod = methodBody(
      documentView,
      "- (void)reloadDocumentFromStore"
    );
    const restoreIndex = reloadMethod.indexOf("restoreAllRotationsForDocument:");
    const attachIndex = reloadMethod.indexOf("self.pdfView.document = document");

    expect(documentView).toContain("PapyrusPageRotationRegistry");
    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(attachIndex).toBeGreaterThan(restoreIndex);
  });

  it("makes restore-all invalidate late releases without touching another document", () => {
    const restoreMethod = methodBody(
      registry,
      "- (void)restoreAllRotationsForDocument:"
    );
    const releaseMethod = methodBody(registry, "- (void)releaseLeaseLocked:");

    expect(restoreMethod).toContain("page.rotation = (int)record.originalRotation");
    expect(restoreMethod).toContain("advanceGenerationForDocument:");
    expect(releaseMethod).toContain("lease.generation != currentGeneration");
    expect(releaseMethod).toContain("lease.document");
  });
});
