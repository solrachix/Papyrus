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

const summarizeSamples = (values) => {
  const samples = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (samples.length === 0) return null;
  const percentile = (rank) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * rank) - 1)];
  return {
    samples: samples.length,
    medianMs: percentile(0.5),
    p90Ms: percentile(0.9),
    p95Ms: percentile(0.95),
    maxMs: samples[samples.length - 1],
  };
};

const summarizeFrameSessions = (events, fallback) => {
  const sessions = events
    .filter((event) => event?.name === 'pinch.frames' && event?.scope === 'pinch')
    .map((event) => event.payload)
    .filter((payload) => payload && typeof payload === 'object');
  if (sessions.length === 0) {
    return fallback && typeof fallback === 'object'
      ? { sessions: 1, totalFrames: fallback.total ?? null, over16ms: fallback.over16ms ?? null, over33ms: fallback.over33ms ?? null, maxIntervalMs: fallback.maxIntervalMs ?? null }
      : null;
  }
  const values = (key) => sessions.map((session) => session[key]);
  return {
    sessions: sessions.length,
    totalFrames: values('total').reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0),
    over16ms: summarizeSamples(values('over16ms')),
    over33ms: summarizeSamples(values('over33ms')),
    maxIntervalMs: summarizeSamples(values('maxIntervalMs')),
  };
};

const summarizeSnapshot = (snapshot) => {
  const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
  const measures = Array.isArray(snapshot?.measures) ? snapshot.measures : [];
  const zoomLatencies = measures
    .filter((measure) => measure?.name === 'zoom.commitToSurfaceReady')
    .map((measure) => measure.durationMs);
  const jumpDurations = measures
    .filter((measure) => measure?.name === 'jump.duration')
    .map((measure) => measure.durationMs);
  const jumpLatencyMs = summarizeSamples(jumpDurations);
  const frames = snapshot?.frames;
  const dom = snapshot?.dom;
  const memory = snapshot?.memory;

  return {
    zoomCommitToSurfaceReadyMs: summarizeSamples(zoomLatencies),
    frameDrops: summarizeFrameSessions(events, frames),
    heapAtSnapshotBytes:
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

const formatSummary = (summary) =>
  summary == null
    ? 'indisponível'
    : `${summary.medianMs} / ${summary.p90Ms} / ${summary.p95Ms} / ${summary.maxMs} ms (n=${summary.samples})`;

const formatDistribution = (summary, unit = '') => {
  if (summary == null) return 'indisponível';
  if (typeof summary === 'number') return `${summary}${unit}`;
  return `${summary.medianMs}${unit} / ${summary.p90Ms}${unit} / ${summary.p95Ms}${unit} / ${summary.maxMs}${unit} (n=${summary.samples})`;
};

const renderMarkdown = (report) => `# Papyrus — Web performance

- Status: **${report.status}**
- Fixture: \`${report.fixture}\`
- Cenário: \`${report.scenario}\`

| Métrica | Valor |
| --- | ---: |
| Commit de zoom → surface pronta (mediana / P90 / P95 / máx.) | ${formatSummary(report.metrics.zoomCommitToSurfaceReadyMs)} |
| Sessões de pinch | ${formatMetric(report.metrics.frameDrops?.sessions)} |
| Frames amostrados | ${formatMetric(report.metrics.frameDrops?.totalFrames)} |
| Frames acima de 16,67 ms (mediana / P90 / P95 / máx.) | ${formatDistribution(report.metrics.frameDrops?.over16ms)} |
| Frames acima de 33,33 ms (mediana / P90 / P95 / máx.) | ${formatDistribution(report.metrics.frameDrops?.over33ms)} |
| Maior intervalo entre frames (mediana / P90 / P95 / máx.) | ${formatDistribution(report.metrics.frameDrops?.maxIntervalMs, ' ms')} |
| Heap JS no snapshot | ${formatMetric(report.metrics.heapAtSnapshotBytes, ' bytes')} |
| Jump latency (mediana / P90 / P95 / máx.) | ${formatSummary(report.metrics.jumpLatencyMs)} |
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
        heapAtSnapshotBytes: null,
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
