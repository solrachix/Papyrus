import fs from 'node:fs';

const DEFAULT_PAGE_SIZE = [612, 792];

function escapePdfText(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
}

export function createBenchmarkPdf({ pageCount = 1000, pageSizeForPage } = {}) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('pageCount must be a positive integer');
  }

  const objects = new Map();
  const addObject = (id, body) => objects.set(id, body);
  const pageObjectId = (page) => 5 + (page - 1) * 2;
  const contentObjectId = (page) => pageObjectId(page) + 1;
  const outlineObjectId = (index) => 4 + pageCount * 2 + index;
  const outlineCount = Math.min(20, pageCount);

  addObject(1, '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>');
  addObject(2, `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, i) => `${pageObjectId(i + 1)} 0 R`).join(' ')}] >>`);
  addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  for (let page = 1; page <= pageCount; page += 1) {
    const pageId = pageObjectId(page);
    const contentId = contentObjectId(page);
    const lines = [
      `Papyrus benchmark page ${page} of ${pageCount}`,
      'Synthetic text-only PDF generated locally for repeatable engine measurements.',
      'Rust core candidate: parsing, text extraction, search and outline.',
      `Search token: papyrus-benchmark-${page % 17}`,
    ];
    const commands = ['BT', '/F1 16 Tf', '72 740 Td'];
    for (const [index, line] of lines.entries()) {
      if (index > 0) commands.push('0 -28 Td');
      commands.push(`(${escapePdfText(line)}) Tj`);
    }
    commands.push('ET');
    const stream = commands.join('\n');
    const [width, height] = pageSizeForPage?.(page) ?? DEFAULT_PAGE_SIZE;
    addObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    addObject(contentId, `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`);
  }

  const outlineRoot = 4;
  const firstOutline = outlineCount > 0 ? outlineObjectId(1) : null;
  const lastOutline = outlineCount > 0 ? outlineObjectId(outlineCount) : null;
  addObject(outlineRoot, outlineCount === 0
    ? '<< /Type /Outlines /Count 0 >>'
    : `<< /Type /Outlines /First ${firstOutline} 0 R /Last ${lastOutline} 0 R /Count ${outlineCount} >>`);

  for (let index = 1; index <= outlineCount; index += 1) {
    const id = outlineObjectId(index);
    const previous = index > 1 ? ` /Prev ${outlineObjectId(index - 1)} 0 R` : '';
    const next = index < outlineCount ? ` /Next ${outlineObjectId(index + 1)} 0 R` : '';
    addObject(id, `<< /Title (Section ${index}) /Parent 4 0 R /Dest [${pageObjectId(index)} 0 R /Fit]${previous}${next} >>`);
  }

  const maxObjectId = Math.max(...objects.keys());
  const chunks = ['%PDF-1.7\n%\xFF\xFF\xFF\xFF\n'];
  const offsets = Array(maxObjectId + 1).fill(0);
  let byteOffset = Buffer.byteLength(chunks[0], 'binary');

  for (const id of [...objects.keys()].sort((a, b) => a - b)) {
    const body = objects.get(id);
    offsets[id] = byteOffset;
    const chunk = `${id} 0 obj\n${body}\nendobj\n`;
    chunks.push(chunk);
    byteOffset += Buffer.byteLength(chunk, 'binary');
  }

  const xrefOffset = byteOffset;
  chunks.push(`xref\n0 ${maxObjectId + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= maxObjectId; id += 1) {
    chunks.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${maxObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(''), 'binary');
}

export function writeBenchmarkPdf(outputPath, options = {}) {
  const buffer = createBenchmarkPdf(options);
  fs.writeFileSync(outputPath, buffer);
  return { outputPath, pageCount: options.pageCount ?? 1000, bytes: buffer.byteLength };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const pageCount = Number(process.argv[2] ?? 1000);
  const outputPath = process.argv[3] ?? '/tmp/papyrus-benchmark-1000.pdf';
  console.log(JSON.stringify(writeBenchmarkPdf(outputPath, { pageCount })));
}
