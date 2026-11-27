import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dir = resolve(process.cwd(), "packages/engine-native/android/src/main/java/com/papyrus/engine");
const sources = readdirSync(dir)
  .filter((name) => name.endsWith(".java") || name.endsWith(".kt"))
  .map((name) => ({ name, text: readFileSync(resolve(dir, name), "utf8") }));
const store = sources.find((source) => source.name === "PapyrusEngineStore.java")!.text;

/**
 * pdfium keeps every opened page in native memory until the document closes,
 * and the library has no public "close page". A reader that opened all 1,404
 * pages of a book to measure them held ~640 MB after the reader was left.
 */
describe("Android PDF page lifecycle", () => {
  it("opens pdfium pages only through the engine store", () => {
    const offenders = sources
      .filter((source) => source.name !== "PapyrusEngineStore.java")
      .filter((source) => /pdfium\s*\.\s*openPage\s*\(/.test(source.text))
      .map((source) => source.name);
    expect(offenders).toEqual([]);
  });

  it("reads page sizes only through the engine store", () => {
    const offenders = sources
      .filter((source) => source.name !== "PapyrusEngineStore.java")
      .filter((source) => /pdfium\s*\.\s*getPage(Width|Height)(Point)?\s*\(/.test(source.text))
      .map((source) => source.name);
    expect(offenders).toEqual([]);
  });

  it("lays the document out without loading its pages", () => {
    const viewer = sources.find((source) => source.name === "PapyrusPdfViewerView.java")!.text;
    expect(viewer).toContain("PapyrusEngineStore.layoutPageSizePoints(state, i)");
    expect(store).toMatch(/layoutPageSizePoints[\s\S]*pdfium\.getPageSize\(state\.document, pageIndex\)/);
  });

  it("bounds the pages kept open and closes the rest", () => {
    expect(store).toMatch(/MAX_OPEN_PAGES = \d;/);
    expect(store).toContain('getDeclaredMethod("nativeClosePage", long.class)');
    expect(store).toMatch(/while \(state\.openPages\.size\(\) > MAX_OPEN_PAGES/);
  });

  it("closes the document and its file under the engine lock", () => {
    const release = store.slice(store.indexOf("private static void releaseDocumentLocked"));
    expect(release).toMatch(/closeDocument\(state\.document\)[\s\S]*fileDescriptor\.close\(\)/);
    expect(store).toMatch(/static void closeDocument\(EngineState state\) \{\s*synchronized \(state\.pdfiumLock\) \{\s*releaseDocumentLocked\(state\);/);
    expect(store).toMatch(/static void destroyEngine[\s\S]*closeDocument\(state\);/);
  });

  it("never reports a page as closed when pdfium did not release it", () => {
    const close = store.slice(store.indexOf("private static boolean closePageLocked"), store.indexOf("static void acquirePage"));
    // The native close runs before the pointer is forgotten...
    expect(close.indexOf("nativeClosePageMethod.invoke")).toBeLessThan(close.indexOf("pages.remove(pageIndex)"));
    // ...and a failure keeps the page counted as retained.
    expect(close).toMatch(/else state\.retainedPages\.add\(pageIndex\);/);
    expect(store).toMatch(/count \+= state\.openPages\.size\(\) \+ state\.retainedPages\.size\(\);/);
  });

  it("keeps the reflected pdfium members from being renamed by R8", () => {
    const rules = readFileSync(resolve(process.cwd(), "packages/engine-native/android/consumer-rules.pro"), "utf8");
    expect(rules).toContain("java.util.Map mNativePagesPtr;");
    expect(rules).toContain("long mNativeDocPtr;");
    expect(rules).toContain("private native void nativeClosePage(long);");
  });

  it("can release the document while the reader is away and reopen it", () => {
    expect(store).toMatch(/static boolean suspendDocument[\s\S]*releaseDocumentLocked\(state\);\s*state\.suspended = true;/);
    expect(store).toMatch(/static boolean resumeDocument[\s\S]*newDocument\(fd\)/);
    const module = sources.find((source) => source.name === "PapyrusNativeEngineModule.java")!.text;
    expect(module).toContain("public void suspendDocument(final String engineId, final Promise promise)");
    expect(module).toContain("public void resumeDocument(final String engineId, final Promise promise)");
  });

  it("reports open pages in the lifecycle stats", () => {
    const module = sources.find((source) => source.name === "PapyrusNativeEngineModule.java")!.text;
    expect(module).toContain('result.putInt("openPdfPages", PapyrusEngineStore.openPageCount());');
  });
});
