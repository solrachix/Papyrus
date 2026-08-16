// @vitest-environment node

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it } from "vitest";

import { CBZEngine } from "./index";

const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
  ),
  (character) => character.charCodeAt(0)
);

const createCbz = async (): Promise<Uint8Array> => {
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output);
  await writer.add("page-10.png", new Uint8ArrayReader(ONE_PIXEL_PNG));
  await writer.add(
    "ComicInfo.xml",
    new Uint8ArrayReader(new TextEncoder().encode("<ComicInfo />"))
  );
  await writer.add("page-2.png", new Uint8ArrayReader(ONE_PIXEL_PNG));
  return writer.close();
};

describe("CBZEngine", () => {
  it("opens a CBZ and exposes image entries as ordered pages", async () => {
    const engine = new CBZEngine();

    await engine.load(await createCbz());

    expect(engine.getPageCount()).toBe(2);
    expect(engine.getCurrentPage()).toBe(1);
    expect(await engine.getPageIndex({ kind: "pageNumber", value: 2 })).toBe(1);

    engine.destroy();
  });
});
