import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const fixturePath = process.argv[2];
if (!fixturePath) {
  throw new Error("uso: node scripts/benchmarks/benchmark-cbz.mjs <arquivo.cbz> [--iterations 5]");
}

const iterations = Number(argumentValue("--iterations", 5));
const warmups = Number(argumentValue("--warmups", 1));
const fixture = new Uint8Array(await readFile(fixturePath));

const normalizedName = (name) => name.replaceAll("\\", "/");
const isImage = (name) => {
  const fileName = normalizedName(name).split("/").pop() ?? "";
  return Boolean(fileName) && !fileName.startsWith(".") && /\.(jpe?g|png|gif|svg|webp)$/i.test(fileName);
};
const pagesFromEntries = (entries) =>
  entries
    .filter((entry) => !entry.directory && isImage(entry.filename))
    .sort((left, right) =>
      normalizedName(left.filename).localeCompare(normalizedName(right.filename), undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

const load = async () => {
  const reader = new ZipReader(new Uint8ArrayReader(fixture));
  const entries = pagesFromEntries(await reader.getEntries());
  return { reader, entries };
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const measure = async (operation, repeat = iterations) => {
  for (let index = 0; index < warmups; index += 1) await operation();
  const samples = [];
  for (let index = 0; index < repeat; index += 1) {
    const start = performance.now();
    await operation();
    samples.push(performance.now() - start);
  }
  return { medianMs: median(samples), samplesMs: samples };
};

const checksum = (chunks) => {
  const hash = createHash("sha256");
  for (const chunk of chunks) hash.update(chunk);
  return hash.digest("hex");
};

const loadList = await measure(async () => {
  const { reader, entries } = await load();
  if (entries.length === 0) throw new Error("fixture sem páginas");
  await reader.close();
});

const { reader, entries } = await load();
const indexes = [0, Math.floor(entries.length / 2), entries.length - 1];
const extract = {};
for (const [label, pageIndex] of [
  ["first", indexes[0]],
  ["middle", indexes[1]],
  ["last", indexes[2]],
]) {
  let lastChecksum = "";
  const result = await measure(async () => {
    const bytes = await entries[pageIndex].getData(new Uint8ArrayWriter());
    lastChecksum = checksum([bytes]);
  });
  extract[label] = { ...result, bytes: entries[pageIndex].uncompressedSize, sha256: lastChecksum };
}

let allChecksum = "";
const allPages = await measure(async () => {
  const chunks = [];
  for (const entry of entries) {
    chunks.push(await entry.getData(new Uint8ArrayWriter()));
  }
  allChecksum = checksum(chunks);
});
await reader.close();

console.log(
  JSON.stringify({
    engine: "zip.js",
    fixture: {
      path: fixturePath,
      bytes: fixture.byteLength,
      sha256: createHash("sha256").update(fixture).digest("hex"),
    },
    pages: entries.length,
    iterations,
    warmups,
    loadList,
    extract,
    allPages: { ...allPages, sha256: allChecksum },
  })
);
