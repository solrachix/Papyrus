import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positional = [];
let profile = 'text';

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--profile') {
    profile = args[index + 1] ?? profile;
    index += 1;
  } else {
    positional.push(args[index]);
  }
}

const pageCount = Number(positional[0] ?? 1000);
const outputPath = positional[1] ?? '/tmp/papyrus-benchmark-1000.pdf';
const supportedProfiles = new Set(['text', 'image-heavy', 'varied-sizes', 'text-heavy']);

if (!Number.isInteger(pageCount) || pageCount < 1) {
  throw new Error('pageCount must be a positive integer');
}
if (!supportedProfiles.has(profile)) {
  throw new Error(`unsupported profile: ${profile}`);
}

const isImageHeavy = profile === 'image-heavy';
const objects = new Map();
const addObject = (id, body) => objects.set(id, body);
const objectStride = isImageHeavy ? 3 : 2;
const pageObjectId = (page) => 5 + (page - 1) * objectStride;
const contentObjectId = (page) => pageObjectId(page) + 1;
const imageObjectId = (page) => pageObjectId(page) + 2;
const outlineObjectId = (index) => 4 + pageCount * objectStride + index;
const outlineCount = Math.min(20, pageCount);

const pageSize = (page) => {
  if (profile !== 'varied-sizes') return [612, 792];
  return [
    [612, 792],
    [400, 1100],
    [900, 600],
    [720, 1000],
  ][(page - 1) % 4];
};

const escapePdfText = (value) =>
  value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

const baseLines = (page) => [
  `Papyrus benchmark page ${page} of ${pageCount}`,
  `Synthetic ${profile} PDF generated locally for repeatable engine measurements.`,
  'Rust core candidate: parsing, text extraction, search and outline.',
  `Search token: papyrus-benchmark-${page % 17}`,
];

const textLines = (page) => {
  if (profile !== 'text-heavy') return baseLines(page);
  return [
    ...baseLines(page),
    ...Array.from(
      { length: 80 },
      (_, index) =>
        `Text-heavy searchable line ${index + 1}: page ${page}, token ${
          (page * 83 + index) % 997
        }, lorem ipsum reader workload.`,
    ),
  ];
};

const createImageData = (page, width = 256, height = 256) => {
  const data = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 3;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    data[offset] = (x + page * 7) % 256;
    data[offset + 1] = (y + page * 13) % 256;
    data[offset + 2] = (x + y + page * 17) % 256;
  }
  return data.toString('latin1');
};

addObject(1, '<< /Type /Catalog /Pages 2 0 R /Outlines 4 0 R >>');
addObject(
  2,
  `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from(
    { length: pageCount },
    (_, index) => `${pageObjectId(index + 1)} 0 R`,
  ).join(' ')}] >>`,
);
addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

for (let page = 1; page <= pageCount; page += 1) {
  const pageId = pageObjectId(page);
  const contentId = contentObjectId(page);
  const [width, height] = pageSize(page);
  const lines = textLines(page);
  const commands = ['BT', '/F1 16 Tf', `72 ${height - 52} Td`];
  for (const [index, line] of lines.entries()) {
    const safe = escapePdfText(line);
    if (index > 0) commands.push('0 -18 Td');
    commands.push(`(${safe}) Tj`);
  }
  commands.push('ET');
  if (isImageHeavy) {
    commands.push('q', '400 0 0 400 106 196 cm', '/Im1 Do', 'Q');
  }
  const stream = commands.join('\n');
  const resources = [
    '/Font << /F1 3 0 R >>',
    isImageHeavy ? `/XObject << /Im1 ${imageObjectId(page)} 0 R >>` : null,
  ]
    .filter(Boolean)
    .join(' ');
  addObject(
    pageId,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << ${resources} >> /Contents ${contentId} 0 R >>`,
  );
  addObject(
    contentId,
    `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`,
  );
  if (isImageHeavy) {
    const imageData = createImageData(page);
    addObject(
      imageObjectId(page),
      `<< /Type /XObject /Subtype /Image /Width 256 /Height 256 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${Buffer.byteLength(
        imageData,
        'binary',
      )} >>\nstream\n${imageData}\nendstream`,
    );
  }
}

const outlineRoot = 4;
const firstOutline = outlineCount > 0 ? outlineObjectId(1) : null;
const lastOutline = outlineCount > 0 ? outlineObjectId(outlineCount) : null;
addObject(
  outlineRoot,
  outlineCount === 0
    ? '<< /Type /Outlines /Count 0 >>'
    : `<< /Type /Outlines /First ${firstOutline} 0 R /Last ${lastOutline} 0 R /Count ${outlineCount} >>`,
);

for (let index = 1; index <= outlineCount; index += 1) {
  const id = outlineObjectId(index);
  const previous = index > 1 ? ` /Prev ${outlineObjectId(index - 1)} 0 R` : '';
  const next = index < outlineCount ? ` /Next ${outlineObjectId(index + 1)} 0 R` : '';
  addObject(
    id,
    `<< /Title (Section ${index}) /Parent 4 0 R /Dest [${pageObjectId(index)} 0 R /Fit]${previous}${next} >>`,
  );
}

const maxObjectId = Math.max(...objects.keys());
const chunks = ['%PDF-1.7\n%\xFF\xFF\xFF\xFF\n'];
const offsets = Array(maxObjectId + 1).fill(0);
let byteOffset = Buffer.byteLength(chunks[0], 'binary');

for (const id of [...objects.keys()].sort((left, right) => left - right)) {
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

const resolvedOutputPath = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, chunks.join(''), 'binary');
console.log(
  JSON.stringify({
    outputPath: resolvedOutputPath,
    pageCount,
    profile,
    bytes: fs.statSync(resolvedOutputPath).size,
  }),
);
