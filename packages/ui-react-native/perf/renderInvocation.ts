import type { DocumentEngine } from '@papyrus-sdk/types';

export function invokeRenderPage(
  engine: DocumentEngine,
  pageIndex: number,
  viewTag: number,
  renderScale: number,
) {
  try {
    return Promise.resolve(engine.renderPage(pageIndex, viewTag, renderScale));
  } catch (error) {
    return Promise.reject(error);
  }
}
