import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const options = {
  fixture: 'unknown',
  scenario: 'interactive',
  input: null,
  output: null,
  markdown: null,
};

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === '--fixture') options.fixture = args[++index] ?? options.fixture;
  else if (argument === '--scenario') options.scenario = args[++index] ?? options.scenario;
  else if (argument === '--input') options.input = args[++index] ?? null;
  else if (argument === '--output') options.output = args[++index] ?? null;
  else if (argument === '--markdown') options.markdown = args[++index] ?? null;
}

const protocol = {
  fixtures: [
    'small-20',
    'medium-200',
    'large-1000',
    'image-heavy',
    'varied-sizes',
    'text-heavy',
  ],
  operations: [
    'open',
    'zoom 1→5→1 (20 cycles)',
    'fast scroll',
    'jump 1→500→999',
    'orientation when available',
    'capture before/after',
  ],
  largeDocumentChecks: [
    '5000-page wrapper count remains O(window)',
    'scroll to middle/end and return to start',
    'varied page heights do not create holes or violent scroll jumps',
  ],
};

const findTimestamp = (events, name) => {
  const event = events.find((candidate) => candidate?.name === name);
  return typeof event?.timestampMs === 'number' ? event.timestampMs : null;
};

const summarizeSnapshot = (snapshot) => {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const measures = Array.isArray(snapshot?.measures) ? snapshot.measures : [];
  const zoomMeasure = measures.find(
    (measure) => measure?.name === 'zoom.commitToSurfaceReady',
  );
  const jumpStart = findTimestamp(events, 'jump.start');
  const jumpEnd = findTimestamp(events, 'jump.end');
  const jumpLatencyMs =
    jumpStart != null && jumpEnd != null && jumpEnd >= jumpStart
      ? jumpEnd - jumpStart
      : null;
  const frames = snapshot?.frames;
  const dom = snapshot?.dom;
  const memory = snapshot?.memory;

  return {
    zoomCommitToSurfaceReadyMs:
      typeof zoomMeasure?.durationMs === 'number' ? zoomMeasure.durationMs : null,
    frameDrops:
      frames && typeof frames === 'object'
        ? {
            over16ms: frames.over16ms ?? null,
            over33ms: frames.over33ms ?? null,
            maxIntervalMs: frames.maxIntervalMs ?? null,
          }
        : null,
    peakMemoryBytes:
      memory && typeof memory.usedJSHeapSize === 'number'
        ? memory.usedJSHeapSize
        : null,
    jumpLatencyMs,
    wrappers: dom?.pageContainers ?? null,
    canvases: dom?.canvases ?? null,
    pageRenderers: dom?.pageRenderers ?? null,
  };
};

const formatMetric = (value, suffix = '') =>
  value == null ? 'indisponível' : `${value}${suffix}`;

const renderMarkdown = (report) => `# Papyrus — Web performance

- Status: **${report.status}**
- Fixture: \`${report.fixture}\`
- Cenário: \`${report.scenario}\`

| Métrica | Valor |
| --- | ---: |
| Commit de zoom → surface pronta | ${formatMetric(report.metrics.zoomCommitToSurfaceReadyMs, ' ms')} |
| Frames acima de 16,67 ms | ${formatMetric(report.metrics.frameDrops?.over16ms)} |
| Frames acima de 33,33 ms | ${formatMetric(report.metrics.frameDrops?.over33ms)} |
| Maior intervalo entre frames | ${formatMetric(report.metrics.frameDrops?.maxIntervalMs, ' ms')} |
| Peak de heap JS | ${formatMetric(report.metrics.peakMemoryBytes, ' bytes')} |
| Jump latency | ${formatMetric(report.metrics.jumpLatencyMs, ' ms')} |
| Wrappers | ${formatMetric(report.metrics.wrappers)} |
| Canvas | ${formatMetric(report.metrics.canvases)} |
| PageRenderers | ${formatMetric(report.metrics.pageRenderers)} |

## Limitações

${report.limitations.map((limitation) => `- ${limitation}`).join('\n')}
`;

const snapshot = options.input
  ? JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'))
  : null;
const report = {
  status: snapshot ? 'captured' : 'not-run',
  fixture: options.fixture,
  scenario: options.scenario,
  protocol,
  metrics: snapshot
    ? summarizeSnapshot(snapshot)
    : {
        zoomCommitToSurfaceReadyMs: null,
        frameDrops: null,
        peakMemoryBytes: null,
        jumpLatencyMs: null,
        wrappers: null,
        canvases: null,
        pageRenderers: null,
      },
  limitations: snapshot
    ? [
        'A captura depende de um browser real e das APIs disponíveis no runtime.',
        'A amostra de frames é observação da thread JS, não FPS de hardware.',
        'Fixtures sintéticos não representam a distribuição real de PDFs.',
      ]
    : [
        'Nenhum snapshot do browser foi fornecido; a execução real ainda não foi feita.',
        'As métricas ficam indisponíveis até o fluxo ser executado em um browser.',
      ],
};

if (options.output) {
  const outputPath = path.resolve(options.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}
if (options.markdown) {
  const markdownPath = path.resolve(options.markdown);
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, renderMarkdown(report));
}

console.log(JSON.stringify(report));
