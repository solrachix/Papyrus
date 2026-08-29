import { describe, expect, it, vi } from "vitest";

import { createRenderGeneration } from "@papyrus-sdk/core";
import { promoteWebRenderSurface } from "./pageSurfacePromotion";

describe("web page surface promotion", () => {
  it("keeps the latest canvas and text layer when an older render resolves later", () => {
    const visibleCanvas = document.createElement("canvas");
    const visibleTextLayer = document.createElement("div");
    const firstCanvas = document.createElement("canvas");
    const firstTextLayer = document.createElement("div");
    const latestCanvas = document.createElement("canvas");
    const latestTextLayer = document.createElement("div");
    firstCanvas.width = 100;
    firstCanvas.height = 100;
    latestCanvas.width = 200;
    latestCanvas.height = 200;
    firstTextLayer.append("first");
    latestTextLayer.append("latest");
    latestTextLayer.style.setProperty("--scale-factor", "2");
    vi.spyOn(visibleCanvas, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    const generations = createRenderGeneration();
    const firstGeneration = generations.next();
    const latestGeneration = generations.next();

    if (generations.isCurrent(latestGeneration)) {
      promoteWebRenderSurface({
        visibleCanvas,
        nextCanvas: latestCanvas,
        visibleTextLayer,
        nextTextLayer: latestTextLayer,
      });
    }
    if (generations.isCurrent(firstGeneration)) {
      promoteWebRenderSurface({
        visibleCanvas,
        nextCanvas: firstCanvas,
        visibleTextLayer,
        nextTextLayer: firstTextLayer,
      });
    }

    expect(visibleCanvas.width).toBe(200);
    expect(visibleCanvas.height).toBe(200);
    expect(visibleTextLayer.textContent).toBe("latest");
    expect(visibleTextLayer.style.getPropertyValue("--scale-factor")).toBe("2");
  });
});
