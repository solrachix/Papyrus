import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getComicPreviewSize,
  getComicPageAspectRatio,
  getProtectedComicPageIndexes,
  isCurrentComicPageLoad,
  isComicImageName,
  patchCbrWorkerSource,
  sortComicPageNames,
} from "./comicRuntime";

describe("mobile comic runtime helpers", () => {
  it("keeps only supported comic image entries", () => {
    expect(isComicImageName("pages/001.jpg")).toBe(true);
    expect(isComicImageName("pages/002.webp")).toBe(true);
    expect(isComicImageName("pages/readme.txt")).toBe(false);
    expect(isComicImageName("pages/")).toBe(false);
  });

  it("sorts page names naturally", () => {
    expect(
      sortComicPageNames(["page-10.jpg", "page-2.jpg", "page-1.jpg"])
    ).toEqual(["page-1.jpg", "page-2.jpg", "page-10.jpg"]);
  });

  it("patches the shipped CBR worker to use the packaged WASM asset", () => {
    const worker = readFileSync(
      resolve(
        process.cwd(),
        "packages/engine-cbr-mobile/runtime/worker-bundle.js.txt"
      ),
      "utf8"
    );

    const patched = patchCbrWorkerSource(worker, "/assets/libarchive.wasm");

    expect(patched).not.toContain(
      'new URL("libarchive.wasm",import.meta.url).href'
    );
    expect(patched).toContain(JSON.stringify("/assets/libarchive.wasm"));
  });

  it("caps comic previews without upscaling them", () => {
    expect(getComicPreviewSize(1600, 2400)).toEqual({ width: 240, height: 360 });
    expect(getComicPreviewSize(120, 180)).toEqual({ width: 120, height: 180 });
  });

  it("keeps the page geometry when a cached image URL is evicted", () => {
    expect(getComicPageAspectRatio(1200, 1800)).toBe("1200 / 1800");
    expect(getComicPageAspectRatio(0, 0)).toBe("1 / 1");
  });

  it("protects visible and pending pages from URL eviction", () => {
    expect(
      Array.from(getProtectedComicPageIndexes(1, [3, 4], [5])).sort(
        (left, right) => left - right
      )
    ).toEqual([-1, 0, 1, 3, 4, 5]);
  });

  it("rejects page extraction completions from an older document", () => {
    const entry = { name: "old.jpg" };
    const currentEntry = { name: "new.jpg" };

    expect(isCurrentComicPageLoad(2, 3, entry, currentEntry)).toBe(false);
    expect(isCurrentComicPageLoad(3, 3, entry, currentEntry)).toBe(false);
    expect(isCurrentComicPageLoad(3, 3, entry, entry)).toBe(true);
  });

  it("embeds the tested helpers in the shipped runtimes", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const html = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/index.html"),
      "utf8"
    );

    expect(runtime.match(/function getComicPageAspectRatio/g)).toHaveLength(1);
    expect(html.match(/function getComicPageAspectRatio/g)).toHaveLength(1);
    expect(html).toContain("root.PapyrusComicRuntime");
    expect(runtime).toContain("getProtectedComicPageIndexes");
    expect(html).toContain("getProtectedComicPageIndexes");
    expect(runtime).toContain("file-chunk-request");
    expect(html).toContain("file-chunk-request");
  });

  it("loads local EPUB files through the native chunk bridge", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const html = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/index.html"),
      "utf8"
    );

    expect(runtime).toContain("sourceToArrayBuffer(source),");
    expect(html).toContain("sourceToArrayBuffer(source),");
    expect(runtime).not.toContain("data = source.uri;");
    expect(html).not.toContain("data = source.uri;");
  });

  it("passes an exact ArrayBuffer to epub.js for base64 sources", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const html = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/index.html"),
      "utf8"
    );

    expect(runtime).toContain("const toExactArrayBuffer = (bytes) =>");
    expect(html).toContain("const toExactArrayBuffer = (bytes) =>");
    expect(runtime).toContain("data = toExactArrayBuffer(decodeBase64(source.data));");
    expect(html).toContain("data = toExactArrayBuffer(decodeBase64(source.data));");
  });

  it("correlates EPUB diagnostics and load terminals by request id", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const html = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/index.html"),
      "utf8"
    );
    for (const artifact of [runtime, html]) {
      expect(artifact).toContain("epub.load.start");
      expect(artifact).toContain("epub.book.ready");
      expect(artifact).toContain("epub.display.start");
      expect(artifact).toContain("epub.load.ready");
      expect(artifact).toContain("epub.load.error");
      expect(artifact).toContain("epub.load.timeout");
      expect(artifact).toContain("loadId");
      expect(artifact).toContain("document.ready");
      expect(artifact).toContain("document.error");
      expect(artifact).toContain("withEpubStageTimeout");
    }
  });

  it("invalidates a pending EPUB load when another document starts", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const loadStart = runtime.indexOf("if (kind === 'load')");
    const generationInvalidation = runtime.indexOf(
      "epubLoadGeneration += 1",
      loadStart
    );
    const currentTypeAssignment = runtime.indexOf(
      "currentType = payload.type",
      loadStart
    );

    expect(generationInvalidation).toBeGreaterThan(loadStart);
    expect(generationInvalidation).toBeLessThan(currentTypeAssignment);
    expect(runtime).toContain(
      "const loadEpub = async (source, loadId, generation) =>"
    );
    expect(runtime).toContain(
      "const result = await loadEpub(payload.source, id, generation);"
    );
  });

  it("rejects a stale EPUB load after outline resolution", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const outlineStart = runtime.indexOf("const outline = await withEpubStageTimeout(");
    const outlineGuard = runtime.indexOf(
      "if (!isCurrentLoad()) throw new Error('EPUB load superseded by a newer load');",
      outlineStart
    );
    const readyEvent = runtime.indexOf(
      "sendEpubDiagnostic('epub.load.ready'",
      outlineStart
    );

    expect(outlineStart).toBeGreaterThan(-1);
    expect(outlineGuard).toBeGreaterThan(outlineStart);
    expect(outlineGuard).toBeLessThan(readyEvent);
  });

  it("uses continuous scrolling for EPUB rendition", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const html = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/index.html"),
      "utf8"
    );

    expect(runtime).toContain("manager: 'continuous'");
    expect(html).toContain("manager: 'continuous'");
    expect(runtime).toContain("flow: 'scrolled-continuous'");
    expect(html).toContain("flow: 'scrolled-continuous'");
    expect(runtime).toContain("rendition.on('relocated'");
    expect(html).toContain("rendition.on('relocated'");
    expect(runtime).toContain("sendEvent('VIEWER_SCROLL'");
    expect(html).toContain("sendEvent('VIEWER_SCROLL'");
    expect(runtime).toContain("sendEvent('VIEWER_TAP'");
    expect(html).toContain("sendEvent('VIEWER_TAP'");
    expect(runtime).not.toContain("flow: 'paginated'");
    expect(html).not.toContain("flow: 'paginated'");
  });

  it("coalesces EPUB manager checks without inspecting function source", () => {
    const runtime = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/runtime.js"),
      "utf8"
    );
    const html = readFileSync(
      resolve(process.cwd(), "packages/ui-react-native/runtime/index.html"),
      "utf8"
    );

    for (const artifact of [runtime, html]) {
      expect(artifact).toContain("const originalCheck = typeof manager.check");
      expect(artifact).toContain("manager.check = function (...args)");
      expect(artifact).toContain("manager.check.request");
      expect(artifact).toContain("manager.check.start");
      expect(artifact).toContain("manager.check.end");
      expect(artifact).toContain("trailingCheck");
      expect(artifact).toContain("latestTrailingArgs");
      expect(artifact).toContain("latestTrailingContext");
      expect(artifact).toContain("inOriginalCheck");
      expect(artifact).toContain("epubSelectionCleanups");
      expect(artifact).toContain("setSelectionActive(false)");
      expect(artifact).not.toContain("String(task)");
    }
  });
});
