import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getComicPreviewSize,
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
});
