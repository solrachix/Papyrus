import type { DocumentEngine, RenderPageTelemetryContext } from '@papyrus-sdk/types';

export function invokeRenderPage(
  engine: DocumentEngine,
  pageIndex: number,
  viewTag: number,
  renderScale: number,
  telemetry?: RenderPageTelemetryContext,
) {
  try {
    return Promise.resolve(engine.renderPage(pageIndex, viewTag, renderScale, telemetry));
  } catch (error) {
    return Promise.reject(error);
  }
}
