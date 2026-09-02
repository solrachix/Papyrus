export type DocumentFormat = "pdf" | "epub" | "text" | "comic";
export type DocumentLoadTerminal = "complete" | "error" | "stale";

export type DocumentLoadToken = {
  loadId: string;
  generation: number;
  format: DocumentFormat;
};

type ActiveLoad = DocumentLoadToken & {
  terminal: DocumentLoadTerminal | null;
};

type LoadCoordinator = {
  start: (format: DocumentFormat) => DocumentLoadToken;
  isCurrent: (token: DocumentLoadToken) => boolean;
  finish: (token: DocumentLoadToken, terminal: DocumentLoadTerminal) => boolean;
  current: () => ActiveLoad | null;
};

export function createDocumentLoadCoordinator(
  createLoadId: (generation: number) => string = (generation) =>
    `document-load-${generation}`,
): LoadCoordinator {
  let generation = 0;
  let active: ActiveLoad | null = null;

  return {
    start(format) {
      if (active?.terminal === null) {
        active = { ...active, terminal: "stale" };
      }
      generation += 1;
      active = {
        loadId: createLoadId(generation),
        generation,
        format,
        terminal: null,
      };
      return active;
    },

    isCurrent(token) {
      return (
        active?.loadId === token.loadId &&
        active.generation === token.generation &&
        active.terminal === null
      );
    },

    finish(token, terminal) {
      if (!this.isCurrent(token)) return false;
      active = { ...active!, terminal };
      return true;
    },

    current() {
      return active;
    },
  };
}
