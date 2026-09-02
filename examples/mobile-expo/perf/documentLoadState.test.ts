import { describe, expect, it } from "vitest";
import { createDocumentLoadCoordinator } from "./documentLoadState";

describe("document load coordinator", () => {
  it("accepts the current load terminal exactly once", () => {
    const coordinator = createDocumentLoadCoordinator((generation) => `load-${generation}`);
    const load = coordinator.start("text");

    expect(coordinator.isCurrent(load)).toBe(true);
    expect(coordinator.finish(load, "complete")).toBe(true);
    expect(coordinator.finish(load, "error")).toBe(false);
    expect(coordinator.isCurrent(load)).toBe(false);
    expect(coordinator.current()).toMatchObject({
      loadId: "load-1",
      generation: 1,
      format: "text",
      terminal: "complete",
    });
  });

  it("rejects an old load from affecting the newer load", () => {
    const coordinator = createDocumentLoadCoordinator((generation) => `load-${generation}`);
    const first = coordinator.start("text");
    const second = coordinator.start("pdf");

    expect(coordinator.current()).toMatchObject({
      loadId: "load-2",
      terminal: null,
    });
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.finish(first, "complete")).toBe(false);
    expect(coordinator.finish(first, "stale")).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
    expect(coordinator.finish(second, "complete")).toBe(true);
  });

  it("allows the current load to finish with an explicit error", () => {
    const coordinator = createDocumentLoadCoordinator((generation) => `load-${generation}`);
    const load = coordinator.start("text");

    expect(coordinator.finish(load, "error")).toBe(true);
    expect(coordinator.current()).toMatchObject({ terminal: "error" });
  });

  it.each([
    ["text", "epub", "text"],
    ["text", "pdf", "text"],
  ] as const)("keeps only the current document in %s -> %s -> %s", async (...formats) => {
    const coordinator = createDocumentLoadCoordinator((generation) => `load-${generation}`);
    const published: string[] = [];
    const pending = formats.map((format) => coordinator.start(format));

    const finishIfCurrent = (index: number) => {
      const load = pending[index];
      if (coordinator.finish(load, "complete")) published.push(load.format);
    };

    finishIfCurrent(0);
    finishIfCurrent(1);
    finishIfCurrent(2);

    expect(published).toEqual(["text"]);
    expect(coordinator.current()).toMatchObject({ format: "text", terminal: "complete" });
  });
});
