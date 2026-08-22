import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";

const DEFAULT_PAGE_COUNT = 1000;
const DEFAULT_PAGE_SIZE = 64 * 1024;

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const pageCount = Number(argumentValue("--pages", DEFAULT_PAGE_COUNT));
const pageSize = Number(argumentValue("--page-size", DEFAULT_PAGE_SIZE));
const outputPath = argumentValue(
  "--output",
  join(tmpdir(), `papyrus-cbz-${pageCount}p-${pageSize}b.cbz`)
);

if (!Number.isInteger(pageCount) || pageCount < 1) {
  throw new Error("--pages precisa ser um inteiro positivo");
}
if (!Number.isInteger(pageSize) || pageSize < 1) {
  throw new Error("--page-size precisa ser um inteiro positivo");
}

const makePageBytes = (pageNumber) => {
  const bytes = new Uint8Array(pageSize);
  let state = (0x9e3779b9 ^ pageNumber) >>> 0;
  for (let index = 0; index < bytes.length; index += 1) {
    state ^= (state << 13) >>> 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    bytes[index] = (state + index + pageNumber) & 0xff;
  }
  return bytes;
};

const output = new Uint8ArrayWriter();
const writer = new ZipWriter(output);
await writer.add(
  "ComicInfo.xml",
  new Uint8ArrayReader(
    new TextEncoder().encode(
      `<ComicInfo><Title>Papyrus CBZ benchmark</Title><PageCount>${pageCount}</PageCount></ComicInfo>`
    )
  )
);
await writer.add(
  "README.txt",
  new Uint8ArrayReader(
    new TextEncoder().encode("Synthetic deterministic archive fixture; page bytes are not decoded.")
  )
);
await writer.add(
  ".DS_Store",
  new Uint8ArrayReader(new Uint8Array([0, 1, 2, 3]))
);

for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
  await writer.add(
    `pages/page-${pageNumber}.jpg`,
    new Uint8ArrayReader(makePageBytes(pageNumber))
  );
}

const bytes = await writer.close();
await writeFile(outputPath, bytes);

const sha256 = createHash("sha256").update(bytes).digest("hex");
console.log(
  JSON.stringify({
    path: outputPath,
    pages: pageCount,
    pageBytes: pageSize,
    archiveBytes: bytes.byteLength,
    sha256,
  })
);
