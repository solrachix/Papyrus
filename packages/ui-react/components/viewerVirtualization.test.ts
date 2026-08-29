import { describe, expect, it } from "vitest";

import { resolveViewerVirtualWindows } from "./viewerVirtualization";

describe("viewer virtualization windows", () => {
  it("keeps navigation wrappers around a page when render overscan is zero", () => {
    const windows = resolveViewerVirtualWindows({
      pageCount: 5000,
      anchorIndex: 99,
      renderOverscan: 0,
      isSingleViewportMode: false,
    });

    expect(windows.render).toMatchObject({ start: 99, end: 99, count: 1 });
    expect(windows.wrappers).toMatchObject({
      start: 98,
      end: 100,
      count: 3,
    });
  });
});
