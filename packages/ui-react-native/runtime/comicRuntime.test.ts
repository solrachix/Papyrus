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
});
