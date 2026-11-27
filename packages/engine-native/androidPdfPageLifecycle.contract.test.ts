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
    const close = store.slice(store.indexOf("static void closeDocument"));
    expect(close).toMatch(/synchronized \(state\.pdfiumLock\)[\s\S]*closeDocument\(state\.document\)[\s\S]*fileDescriptor\.close\(\)/);
    expect(store).toMatch(/static void destroyEngine[\s\S]*closeDocument\(state\);/);
  });

  it("reports open pages in the lifecycle stats", () => {
    const module = sources.find((source) => source.name === "PapyrusNativeEngineModule.java")!.text;
    expect(module).toContain('result.putInt("openPdfPages", PapyrusEngineStore.openPageCount());');
  });
});
