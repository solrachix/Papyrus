import { describe, expect, it } from "vitest";

import { isContinuousElementMode, isSingleViewportMode } from "./renderMode";

describe("isSingleViewportMode", () => {
  it("keeps element engines continuous when they opt into that layout", () => {
    const comicEngine = {
      getRenderTargetType: () => "element" as const,
      getPageLayoutMode: () => "continuous" as const,
    };

    expect(isSingleViewportMode(comicEngine)).toBe(false);
  });

  it("preserves the existing single-viewport behavior by default", () => {
    expect(
      isSingleViewportMode({ getRenderTargetType: () => "element" as const })
    ).toBe(true);
    expect(
      isSingleViewportMode({ getRenderTargetType: () => "canvas" as const })
    ).toBe(false);
  });

  it("allows continuous element engines to render image previews", () => {
    expect(
      isContinuousElementMode({
        getRenderTargetType: () => "element" as const,
        getPageLayoutMode: () => "continuous" as const,
      })
    ).toBe(true);
    expect(
      isContinuousElementMode({
        getRenderTargetType: () => "element" as const,
      })
    ).toBe(false);
  });
});
