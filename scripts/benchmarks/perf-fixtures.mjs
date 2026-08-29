import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
let outputDirectory = '/tmp/papyrus-pr13-fixtures';

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--output') {
    outputDirectory = args[index + 1] ?? outputDirectory;
    index += 1;
  }
}

const generatorPath = path.resolve('scripts/benchmarks/generate-large-pdf.mjs');
const fixtures = [
  {
    id: 'small-20',
    profile: 'text',
    pageCount: 20,
    expectedSha256: '769b8b9e28eb2f1e9bf6592dc4648df00799d554695c36de9b6fd9e26c4b357a',
  },
  {
    id: 'medium-200',
    profile: 'text',
    pageCount: 200,
    expectedSha256: '9d9f648d75fc7d1ab5b5c42ebc57a084d7159bf22c537377052ca591cc934611',
  },
  {
    id: 'large-1000',
    profile: 'text',
    pageCount: 1000,
    expectedSha256: '1fcfe35bf9736383d0a27d43fd8b428f2bddb04b36db10047af100861ba684ff',
  },
  {
    id: 'image-heavy',
    profile: 'image-heavy',
    pageCount: 20,
    expectedSha256: '1b64884fbff26265d1097251f5c358719c1f963bc4667e128931bbcaa35b86e8',
  },
  {
    id: 'varied-sizes',
    profile: 'varied-sizes',
    pageCount: 100,
    expectedSha256: 'fe5626d96fff005a3cbbab8d307ee76d2599d8dcbe3d8440339ac407c6b3d527',
  },
  {
    id: 'text-heavy',
    profile: 'text-heavy',
    pageCount: 100,
    expectedSha256: '0e524bf2aed079219bd1d0035e8e96d58abb6121b066bf4465f948d5800639e0',
  },
];

fs.mkdirSync(outputDirectory, { recursive: true });

const catalog = fixtures.map((fixture) => {
  const outputPath = path.resolve(outputDirectory, `${fixture.id}.pdf`);
  execFileSync(
    process.execPath,
    [
      generatorPath,
      String(fixture.pageCount),
      outputPath,
      '--profile',
      fixture.profile,
    ],
    { stdio: 'ignore' },
  );
  const bytes = fs.readFileSync(outputPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const pagesMatch = bytes.toString('latin1').match(/\/Type \/Pages \/Count (\d+)/);
  if (Number(pagesMatch?.[1]) !== fixture.pageCount) {
    throw new Error(`fixture ${fixture.id} has an unexpected page count`);
  }
  if (sha256 !== fixture.expectedSha256) {
    throw new Error(`fixture ${fixture.id} has an unexpected SHA-256: ${sha256}`);
  }

  const { expectedSha256: _expectedSha256, ...manifestFixture } = fixture;
  return {
    ...manifestFixture,
    path: outputPath,
    bytes: bytes.length,
    sha256,
  };
});

console.log(JSON.stringify({
  fixtureSet: 'papyrus-pr13',
  outputDirectory: path.resolve(outputDirectory),
  fixtures: catalog,
}));
