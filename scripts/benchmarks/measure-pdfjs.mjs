import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';

const inputPath = process.argv[2] ?? '/tmp/papyrus-benchmark-1000.pdf';
const data = new Uint8Array(fs.readFileSync(inputPath));
const measure = async (label, action) => {
  const start = performance.now();
  const value = await action();
  return { label, ms: Number((performance.now() - start).toFixed(2)), value };
};

const load = await measure('load', () => pdfjs.getDocument({ data, disableWorker: true }).promise);
const document = load.value;
const firstText = await measure('first_page_text', async () => (await document.getPage(1)).getTextContent());
const middlePage = Math.max(1, Math.floor(document.numPages / 2));
const middleText = await measure('middle_page_text', async () => (await document.getPage(middlePage)).getTextContent());
const lastText = await measure('last_page_text', async () => (await document.getPage(document.numPages)).getTextContent());
const outline = await measure('outline', () => document.getOutline());
const operatorList = await measure('first_page_operator_list', async () => (await document.getPage(1)).getOperatorList());
const fullDocumentSearch = await measure('full_document_search', async () => {
  const query = 'papyrus-benchmark';
  let matchingPages = 0;
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ').toLowerCase();
    if (text.includes(query)) matchingPages += 1;
  }
  return matchingPages;
});

console.log(JSON.stringify({
  inputPath,
  bytes: data.byteLength,
  pages: document.numPages,
  results: [
    { ...load, value: undefined },
    { ...firstText, value: { items: firstText.value.items.length } },
    { ...middleText, value: { items: middleText.value.items.length } },
    { ...lastText, value: { items: lastText.value.items.length } },
    { ...outline, value: { items: outline.value?.length ?? 0 } },
    { ...operatorList, value: { fnArray: operatorList.value.fnArray.length } },
    { ...fullDocumentSearch, value: { matchingPages: fullDocumentSearch.value } },
  ],
}, null, 2));

await document.destroy();
