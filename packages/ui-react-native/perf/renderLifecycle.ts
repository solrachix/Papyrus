export type RenderTerminal = 'ready' | 'stale' | 'abandoned' | 'error' | 'cancelled';

export function createRenderLifecycle() {
  let terminal: RenderTerminal | null = null;
  return {
    get terminal() {
      return terminal;
    },
    complete(next: Exclude<RenderTerminal, 'abandoned' | 'error'> | 'error') {
      if (terminal) return false;
      terminal = next;
      return true;
    },
    abandon(reason: 'unmount' | 'superseded' | 'timeout' | 'request-rejected') {
      if (terminal) return false;
      terminal = 'abandoned';
      return reason.length > 0;
    },
  };
}
