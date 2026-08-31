import { describe, expect, it } from "vitest";

import {
  resolveRightSheetHeight,
  supportsNativePageThumbnails,
  supportsPageThumbnails,
} from "./rightSheetLayout";

describe("resolveRightSheetHeight", () => {
  it("uses a shorter sheet for notes than for navigation content", () => {
    expect(resolveRightSheetHeight({ windowHeight: 900, showingNotes: true })).toBe(
      440
    );
    expect(
      resolveRightSheetHeight({ windowHeight: 900, showingNotes: false })
    ).toBe(640);
  });

  it("scales notes height down on shorter screens", () => {
    expect(resolveRightSheetHeight({ windowHeight: 700, showingNotes: true })).toBe(
      392.00000000000006
    );
    expect(
      resolveRightSheetHeight({ windowHeight: 700, showingNotes: false })
    ).toBe(504);
  });

  it("does not offer page thumbnails for reflowable EPUBs", () => {
    expect(supportsPageThumbnails("epub")).toBe(false);
    expect(supportsPageThumbnails("pdf")).toBe(true);
    expect(supportsPageThumbnails("comic")).toBe(true);
    expect(supportsPageThumbnails("text")).toBe(false);
  });

  it("uses the native thumbnail renderer when the active engine has a native id", () => {
    expect(
      supportsNativePageThumbnails({
        renderTarget: "canvas",
        nativeEngineId: "native-engine-1",
        hasViewManager: false,
      })
    ).toBe(true);
    expect(
      supportsNativePageThumbnails({
        renderTarget: "webview",
        nativeEngineId: "native-engine-1",
        hasViewManager: true,
      })
    ).toBe(false);
  });
});
