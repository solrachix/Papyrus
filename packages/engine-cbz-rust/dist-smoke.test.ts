// @vitest-environment node

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const createCbz = async (): Promise<Uint8Array> => {
  const output = new Uint8ArrayWriter();
  const writer = new ZipWriter(output);
  await writer.add(
    "page-1.png",
    new Uint8ArrayReader(Uint8Array.from([1, 2, 3]))
  );
  return writer.close();
};

describe("@papyrus-sdk/engine-cbz-rust dist", () => {
  const distAvailable = existsSync(
    fileURLToPath(new URL("./dist/index.js", import.meta.url))
  );
  const itWithDist = distAvailable ? it : it.skip;

  itWithDist("carrega o WASM real pelo pacote CJS buildado", async () => {
    const { createBundledWasmRustCbzRuntimeFactory } = await import(
      "./dist/index.js"
    );
    const runtime = await createBundledWasmRustCbzRuntimeFactory().load(
      await createCbz()
    );

    expect(runtime.pageCount).toBe(1);
    expect(runtime.pageName(0)).toBe("page-1.png");
    expect(runtime.pageSize(0)).toBe(3);
    expect(Array.from(runtime.readPage(0))).toEqual([1, 2, 3]);
    runtime.destroy?.();
  });

  itWithDist("carrega o WASM real pelo pacote ESM buildado", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith("file:")) return originalFetch(input);
      return new Response(readFileSync(fileURLToPath(url)), {
        headers: { "Content-Type": "application/wasm" },
      });
    };

    try {
      const { createBundledWasmRustCbzRuntimeFactory } = await import(
        "./dist/index.mjs"
      );
      const runtime = await createBundledWasmRustCbzRuntimeFactory().load(
        await createCbz()
      );

      expect(runtime.pageCount).toBe(1);
      expect(runtime.pageName(0)).toBe("page-1.png");
      expect(runtime.pageSize(0)).toBe(3);
      expect(Array.from(runtime.readPage(0))).toEqual([1, 2, 3]);
      runtime.destroy?.();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
