import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const android = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusThumbnail.java");
const module = read("packages/engine-native/android/src/main/java/com/papyrus/engine/PapyrusNativeEngineModule.java");
const api = read("packages/engine-native/index.ts");

describe("generateThumbnail", () => {
  it("is a public function with a support check", () => {
    expect(api).toContain("export async function generateThumbnail(options: PapyrusThumbnailOptions): Promise<PapyrusThumbnail>");
    expect(api).toContain("export const isThumbnailGenerationSupported = (): boolean =>");
  });

  it("stays off on iOS until the native side is validated", () => {
    expect(api).toMatch(/isThumbnailGenerationSupported = \(\): boolean =>\s*Platform\.OS === "android" &&/);
  });

  it("refuses remote documents: a thumbnail never downloads", () => {
    expect(api).toMatch(/\/\^https\?:\/i\.test\(options\.uri\)/);
    expect(android).toContain('throw new IllegalArgumentException("the document must be a local file")');
  });

  it("closes the PDF, the page and the file before returning", () => {
    expect(android).toMatch(/try \(ParcelFileDescriptor descriptor = openDescriptor\(context, sourceUri\);\s*PdfRenderer renderer = new PdfRenderer\(descriptor\)\)/);
    expect(android).toMatch(/try \(PdfRenderer\.Page page = renderer\.openPage/);
    expect(android).toMatch(/finally \{\s*if \(bitmap != null\) bitmap\.recycle\(\);/);
  });

  it("does not go through the reader's pdfium engine", () => {
    expect(android).not.toContain("PapyrusEngineStore");
    expect(android).not.toContain("com.shockwave.pdfium");
  });

  it("writes the image aside and renames it", () => {
    expect(android).toContain('new File(destination.getPath() + ".part")');
    expect(android).toContain("partial.renameTo(destination)");
  });

  it("runs one at a time on a background-priority thread", () => {
    expect(module).toMatch(/thumbnailExecutor =\s*java\.util\.concurrent\.Executors\.newSingleThreadExecutor/);
    expect(module).toContain("THREAD_PRIORITY_BACKGROUND");
    expect(module).toContain("public void generateThumbnail(final ReadableMap options, final Promise promise)");
  });
});
