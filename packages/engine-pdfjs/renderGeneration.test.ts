import { describe, expect, it, vi } from "vitest";

import { PDFJSEngine } from "./index";

describe("PDFJSEngine render cancellation", () => {
  it("cancels the previous render for the same page and keeps the latest task", async () => {
    let renderCount = 0;
    let resolveLatest: (() => void) | undefined;
    const cancel = vi.fn(() => {
      firstReject?.({ name: "RenderingCancelledException" });
    });
    let firstReject: ((reason?: unknown) => void) | undefined;

    const page = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 100 * scale,
        height: 140 * scale,
        scale,
      }),
      render: () => {
        renderCount += 1;
        if (renderCount === 1) {
          const promise = new Promise<void>((_, reject) => {
            firstReject = reject;
          });
          return { promise, cancel };
        }

        const promise = new Promise<void>((resolve) => {
          resolveLatest = resolve;
        });
        return { promise, cancel: vi.fn() };
      },
    };
    const engine = new PDFJSEngine();
    (engine as any).pdfDoc = {
      getPage: vi.fn().mockResolvedValue(page),
    };

    const firstTarget = { height: 0, width: 0, getContext: () => ({}) };
    const secondTarget = { height: 0, width: 0, getContext: () => ({}) };
    const firstRender = engine.renderPage(0, firstTarget, 1);
    await Promise.resolve();
    const secondRender = engine.renderPage(0, secondTarget, 1.2);

    await Promise.resolve();
    resolveLatest?.();
    await Promise.all([firstRender, secondRender]);

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(renderCount).toBe(2);
  });
});
