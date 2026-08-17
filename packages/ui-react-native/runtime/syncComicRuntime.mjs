import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeDirectory = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(runtimeDirectory, "comicRuntime.js"), "utf8");

const replaceMarkedSource = (content, start, end, replacement) => {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error(`Runtime marker not found: ${start}`);
  }
  return `${content.slice(0, startIndex)}${start}${replacement}${content.slice(
    endIndex
  )}`;
};

const runtimePath = resolve(runtimeDirectory, "runtime.js");
const runtime = await readFile(runtimePath, "utf8");
await writeFile(
  runtimePath,
  replaceMarkedSource(
    runtime,
    "/* @papyrus-comic-runtime:start */",
    "/* @papyrus-comic-runtime:end */",
    `\n${source.trim()}\n`
  )
);

const htmlPath = resolve(runtimeDirectory, "index.html");
const html = await readFile(htmlPath, "utf8");
await writeFile(
  htmlPath,
  replaceMarkedSource(
    html,
    "<!-- @papyrus-comic-runtime:start -->",
    "<!-- @papyrus-comic-runtime:end -->",
    `\n    <script>\n${source}\n    </script>\n`
  )
);
