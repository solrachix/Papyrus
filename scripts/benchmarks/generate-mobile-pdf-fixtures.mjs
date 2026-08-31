import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMobileFixtures, verifyMobileFixtures } from './pdfFixtureGenerator.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputDir = path.join(repoRoot, 'examples', 'mobile-expo');
const command = process.argv[2] ?? '--check';

if (command === '--write') {
  console.log(JSON.stringify(await generateMobileFixtures(outputDir), null, 2));
} else if (command === '--check') {
  console.log(JSON.stringify(await verifyMobileFixtures(outputDir), null, 2));
} else {
  throw new Error('usage: generate-mobile-pdf-fixtures.mjs --write|--check');
}
