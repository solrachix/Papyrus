import type { DocumentEngine } from '@papyrus-sdk/types';

export function invokeRenderPage(
  engine: DocumentEngine,
  pageIndex: number,
  viewTag: number,
  renderScale: number,
) {
  return Promise.resolve().then(() => engine.renderPage(pageIndex, viewTag, renderScale));
}
