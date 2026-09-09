import { describe, expect, it } from "vitest";

import { resolvePageScrubberPage } from "./pageScrubberModel";

describe("resolvePageScrubberPage", () => {
  it("maps the top, middle, and bottom of the track to document pages", () => {
    expect(
      resolvePageScrubberPage({ position: 22, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(1);
    expect(
      resolvePageScrubberPage({ position: 150, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(89);
    expect(
      resolvePageScrubberPage({ position: 278, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(177);
  });

  it("clamps invalid positions and empty documents safely", () => {
    expect(
      resolvePageScrubberPage({ position: -100, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(1);
    expect(
      resolvePageScrubberPage({ position: 999, trackHeight: 300, thumbHeight: 44, pageCount: 177 })
    ).toBe(177);
    expect(
      resolvePageScrubberPage({ position: 100, trackHeight: 300, thumbHeight: 44, pageCount: 0 })
    ).toBeNull();
  });
});
