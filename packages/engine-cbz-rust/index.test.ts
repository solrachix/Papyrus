// @vitest-environment node

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { describe, expect, it, vi } from "vitest";

import {
  RustCBZEngine,
  type RustCbzRuntime,
  type RustCbzRuntimeFactory,
} from "./index";

const createCbz = async (): Promise<Uint8Array> => {
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output);
  await writer.add(
    "page-10.png",
    new Uint8ArrayReader(Uint8Array.from([10, 10, 10]))
  );
  await writer.add(
    "ComicInfo.xml",
    new Uint8ArrayReader(new TextEncoder().encode("<ComicInfo />"))
  );
  await writer.add(
    "page-2.png",
    new Uint8ArrayReader(Uint8Array.from([2, 2, 2]))
  );
  return writer.close();
};

const createRuntime = (): RustCbzRuntime => ({
  pageCount: 2,
  pageName: (pageIndex) =>
    pageIndex === 0 ? "page-2.png" : "page-10.png",
  pageSize: () => 3,
  readPage: (pageIndex) =>
    pageIndex === 0
      ? Uint8Array.from([2, 2, 2])
      : Uint8Array.from([10, 10, 10]),
  destroy: vi.fn(),
});

describe("RustCBZEngine", () => {
  it("carrega páginas ordenadas pelo runtime Rust", async () => {
    const runtime = createRuntime();
    const runtimeFactory: RustCbzRuntimeFactory = {
      load: vi.fn().mockResolvedValue(runtime),
    };
    const engine = new RustCBZEngine({ runtimeFactory });
    const source = await createCbz();

    await engine.load(source);

    expect(runtimeFactory.load).toHaveBeenCalledWith(source);
    expect(engine.getPageCount()).toBe(2);
    await expect(
      engine.getPageIndex({ kind: "pageNumber", value: 2 })
    ).resolves.toBe(1);

    engine.destroy();
    expect(runtime.destroy).toHaveBeenCalledOnce();
  });

  it("usa zip.js quando o runtime Rust não inicializa", async () => {
    const runtimeFactory: RustCbzRuntimeFactory = {
      load: vi.fn().mockRejectedValue(new Error("WASM indisponível")),
    };
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const engine = new RustCBZEngine({ runtimeFactory });

    await engine.load(await createCbz());

    expect(engine.getPageCount()).toBe(2);
    expect(warning).toHaveBeenCalledWith(
      "[RustCBZEngine] WASM indisponível; usando zip.js",
      expect.any(Error)
    );
    warning.mockRestore();
  });
});
